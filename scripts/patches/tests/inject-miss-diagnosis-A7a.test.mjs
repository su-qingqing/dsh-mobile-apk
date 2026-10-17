// inject-miss-diagnosis-A7a.test.mjs — A7a-1 回归：require 没命中模块表时，点名「谁在要 + 缺的是谁」。
//
// 苏青青 1017 判决 A7(a)→A7a-1 的要求（逐字）：
//   「A7a-1 落地时**带一条回归** —— 造一个"**真缺行**"的场景（某行 `require` 一个不在图里的包），
//     断言**新消息里同时出现消费者行 id 与缺失包名**。这条回归红＝改对了；不红＝消息没生效。」
//
// 本测试：① 对只读 rc.2 真产物夹具跑生产 CLI（--only inject-miss-diagnosis-A7a），验 marker／幂等／可解析；
//        ② **真缺行场景**：把 makeRequire 原文抽出来，用桩驱动 —— 一个消费者行 require 一个
//           三层（seed／loadCache／factories）都没有的包 ⇒ 断言消息里**同时**有消费者行 id 与包名；
//        ③ 反向：三层里有它时**不许**抛（不许把正常解析判成缺行）；
//        ④ 精确性：消费者**声明过**该包（dsh.client.inject 里有）⇒ 多一句"它的行不在图上"；
//           没声明过 ⇒ **不许**出现那句（消息只报事实）；
//        ⑤ 反误报：本补丁**不许**去改 `arriveGraphRow` 里那个 inject 缺行的 if ——
//           那条路才是会误报的（ui-primitives 被 5 行 inject 但不是图行）。断言它原样保留。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-modules'
const ID = 'inject-miss-diagnosis-A7a'
const MARKER = 'dsh-mobile inject-miss diagnosis (A7a)'
const CONSUMER = '@deepseek-ai/dsh-client-ui-jobs'
const MISSING = '@deepseek-ai/dsh-api-gateway'
const NON_ROW = '@deepseek-ai/dsh-client-ui-primitives'

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a7a-test-'))
try {
  const target = join(scratch, PKG, 'lib', 'client.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(versionedFixture('dsh-client-modules', 'lib', 'client.js'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-client-modules', 'package.json')))

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅本补丁）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 数 = 1', (patched.split(MARKER).length - 1) === 1)
  check('反 no-op：旧的匿名文案已不在场', !patched.includes('throw new Error(`client-modules: require("${spec}") missed the module table'))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)
  check('chrome87 语法下限：未引入 ?? 或 ?.（本补丁只加 === void 0 与 || []）',
    !/dshMobile\w*\s*\?\?|dshMobile\w*\?\./.test(patched))

  // ── 抽出 makeRequire 原文，用桩驱动 ──
  const HEAD = 'makeRequire(ownerId, edges) {'
  const start = patched.indexOf(HEAD)
  const end = patched.indexOf('\n\t\t\t}\n', start)
  if (start < 0 || end < 0) throw new Error('makeRequire 未找到')
  const method = patched.slice(start, end + '\n\t\t\t}'.length)
  const makeRegistry = (graphRows) => {
    const obj = new Function('stripClientSuffix', 'CLIENT_CHUNK', 'return ({ ' + method + ' });')(
      (s) => String(s).replace(/\.client$/, ''),
      /^[\w.-]+\.js$/,
    )
    obj.seed = new Map()
    obj.loadCache = new Map()
    obj.factories = new Map()
    obj.materializing = new Set()
    obj.graphRows = graphRows
    obj.import = async () => { throw new Error('not used') }
    obj.importChunk = async () => { throw new Error('not used') }
    obj.materialize = () => { throw new Error('not used') }
    return obj
  }
  const call = (obj, spec) => { try { obj.makeRequire(CONSUMER, new Set())(spec); return null } catch (e) { return e } }

  // ② 真缺行：三层都没有 ⇒ 抛，且**同时**点名消费者与缺失包名
  const e1 = call(makeRegistry(new Map()), MISSING)
  check('真缺行场景：抛错', e1 instanceof Error, String(e1))
  check('★ 消息里出现**消费者行 id**', e1 !== null && e1.message.includes(CONSUMER), e1 && e1.message)
  check('★ 消息里出现**缺失包名**', e1 !== null && e1.message.includes(MISSING), e1 && e1.message)
  check('消息仍保留原有诊断句（未命中模块表 / 也没 factory）',
    e1 !== null && /missed the module table/.test(e1.message) && /no registered package factory/.test(e1.message), e1 && e1.message)

  // ④ 精确性：消费者声明过它 ⇒ 多一句；没声明 ⇒ 不许有
  const declaredRows = new Map([[CONSUMER, { id: CONSUMER, inject: [MISSING], external: [] }]])
  const e2 = call(makeRegistry(declaredRows), MISSING)
  check('消费者在 dsh.client.inject 里声明过 ⇒ 多一句"它的行不在图上"',
    e2 !== null && /declares ".*" in dsh\.client\.inject/.test(e2.message) && /absent from graph\.entries/.test(e2.message), e2 && e2.message)

  const undeclaredRows = new Map([[CONSUMER, { id: CONSUMER, inject: [NON_ROW], external: [] }]])
  const e3 = call(makeRegistry(undeclaredRows), MISSING)
  check('消费者没声明过它 ⇒ **不许**出现"声明过"那句', e3 !== null && !/declares ".*" in dsh\.client\.inject/.test(e3.message), e3 && e3.message)

  // ③ 反向：三层里有它 ⇒ 不许抛
  const ok1 = makeRegistry(new Map())
  ok1.loadCache.set(MISSING, { exports: { ok: 1 } })
  check('loadCache 有它 ⇒ 正常返回，不抛', call(ok1, MISSING) === null)
  const ok2 = makeRegistry(new Map())
  ok2.seed.set(MISSING, { seeded: true })
  check('seed 有它 ⇒ 正常返回，不抛', call(ok2, MISSING) === null)

  // ⑤ 反误报：inject 缺行那条 if **必须原样保留**（那条路才会误报 5 行）
  check('未改 arriveGraphRow 的 inject 缺行 if（那条路才是会误报的）',
    patched.includes('const dependency = this.graphRows.get(packageName);\n' + '\t\t\t\t\t' + 'if (dependency !== void 0) await this.arriveDependency(row.id, dependency, [], visited);'))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
