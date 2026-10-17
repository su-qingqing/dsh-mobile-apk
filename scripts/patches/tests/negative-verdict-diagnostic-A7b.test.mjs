// negative-verdict-diagnostic-A7b.test.mjs — A7(b) 第一步：否定判决缓存只加读数出声、**不改行为**。
//
// 苏青青 1017 第 7 条判：**分两步收 —— 先只加诊断（命中否定缓存时出声），重试策略后议**。
// 所以本回归的重点有两个方向：
//   ① 诊断**真的出声**（且只在可疑的那种、且不刷屏）；
//   ② 缓存**真的没被改**（pkgMeta 的读写、null 语义、两个写入点、返回路径都不许动）。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-modules'
const ID = 'negative-verdict-diagnostic-A7b'
const MARKER = 'dsh-mobile negative verdict diagnostic (A7b)'

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a7b-test-'))
try {
  const target = join(scratch, PKG, 'lib', 'index.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(versionedFixture('dsh-client-modules', 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-client-modules', 'package.json')))

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅本补丁）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 数 = 4（字段＋命中＋两个写入点）', (patched.split(MARKER).length - 1) === 4, 'got ' + (patched.split(MARKER).length - 1))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)

  // ── ② 零行为变化：缓存的读写与语义必须原样 ──
  check('反 no-op：侧表字段已加', patched.includes('dshMobileNegative = /* @__PURE__ */ new Map();'))
  check('pkgMeta 读仍在（get）', patched.includes('const cached = this.pkgMeta.get(sourceKey);'))
  check('两个否定写入点仍是 `set(sourceKey, null)`（恰 2 处，语义未改）',
    (patched.split('this.pkgMeta.set(sourceKey, null);').length - 1) === 2,
    'got ' + (patched.split('this.pkgMeta.set(sourceKey, null);').length - 1))
  check('命中后仍 return cached（返回路径未改）', /if \(cached !== void 0\) \{[\s\S]{0,260}return cached;/.test(patched))
  check('不缩短缓存寿命：没有 delete/invalidate 侧表或 pkgMeta',
    !/this\.pkgMeta\.delete\(/.test(patched) && !/dshMobileNegative\.delete\(/.test(patched))

  // ── ① 诊断真的出声 ──
  const HEAD = 'dshMobileNoteNegativeHit(sourceKey) {'
  const s = patched.indexOf(HEAD)
  const e = patched.indexOf('\n\t}\n', s)
  if (s < 0 || e < 0) throw new Error('helper 未找到')
  const helper = patched.slice(s, e + '\n\t}'.length)
  const makeHost = (kind, withLogger = true) => {
    const warns = []
    const obj = new Function('return ({ ' + helper + ' });')()
    obj.dshMobileNegative = new Map()
    if (kind !== null) obj.dshMobileNegative.set('key-1', { kind, loaderName: '@deepseek-ai/dsh-api-gateway', hits: 0 })
    obj.ctx = withLogger ? { logger: { warn: (m) => warns.push(m) } } : {}
    return { obj, warns }
  }

  const a = makeHost('unresolvable')
  a.obj.dshMobileNoteNegativeHit('key-1')
  check('unresolvable 第 1 次命中 ⇒ 出声', a.warns.length === 1, 'warns=' + a.warns.length)
  check('消息里点名 entry 与"被钉成 无解析包根"',
    a.warns.length === 1 && a.warns[0].includes('@deepseek-ai/dsh-api-gateway') && /pinned as "no resolvable package root"/.test(a.warns[0]), a.warns[0])
  a.obj.dshMobileNoteNegativeHit('key-1')
  check('第 2 次命中 ⇒ 出声（1,2,4,8… 才出声）', a.warns.length === 2, 'warns=' + a.warns.length)
  check('第 2 次的消息带上次数 2', /consulted 2x/.test(a.warns[1]), a.warns[1])
  a.obj.dshMobileNoteNegativeHit('key-1')
  check('第 3 次命中 ⇒ **不出声**（防刷屏）', a.warns.length === 2, 'warns=' + a.warns.length)
  a.obj.dshMobileNoteNegativeHit('key-1')
  check('第 4 次命中 ⇒ 又出声', a.warns.length === 3 && /consulted 4x/.test(a.warns[2]), 'warns=' + a.warns.length)
  check('计数确实在累加（hits=4）', a.obj.dshMobileNegative.get('key-1').hits === 4)

  const b = makeHost('not-a-client-row')
  for (let i = 0; i < 5; i++) b.obj.dshMobileNoteNegativeHit('key-1')
  check('not-a-client-row ⇒ 一次都不出声（稳定事实，不狼来了）', b.warns.length === 0, 'warns=' + b.warns.length)
  check('但它仍然计数（hits=5）', b.obj.dshMobileNegative.get('key-1').hits === 5)

  const c = makeHost('unresolvable')
  let threw = false
  try { c.obj.dshMobileNoteNegativeHit('unknown-key') } catch { threw = true }
  check('侧表里没有该 key ⇒ 不抛（不引入新崩溃点）', !threw)

  const d = makeHost('unresolvable', false)
  let threw2 = false
  try { d.obj.dshMobileNoteNegativeHit('key-1') } catch { threw2 = true }
  check('logger.warn 缺席 ⇒ 静默跳过、不抛', !threw2)
  check('logger 缺席时仍计数', d.obj.dshMobileNegative.get('key-1').hits === 1)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
