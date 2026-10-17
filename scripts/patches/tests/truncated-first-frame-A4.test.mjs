// truncated-first-frame-A4.test.mjs — A4① 补丁回归：残缺首帧不再被说成「空/无 header」（同族三处）。
//
// 本测试：① 对只读 rc.2 真产物夹具跑生产 CLI（--only truncated-first-frame-A4），验 marker／幂等／可解析；
//        ② **三处站点**都必须换成新形态（少一处就是族没收干净）；旧语句形态必须**一处不剩**；
//        ③ 把其中一处的新语句原文抽出来，用桩驱动：真空（tornStart 为 undefined）与首帧残缺
//           （tornStart 有值）必须给出**不同**诊断、后者点名起点字节；有帧时**不许**抛；
//        ④ 钉住我写在交付里的那句「外层包装不动」—— 它必须仍以 corrupt 包装并串接内层原文，
//           否则我对外承诺的「读数会怎么变」就成了空话；
//        ⑤ 未收的那三处（`*.done` 不可达分支）与四处非 zstd 站点**必须原样保留** ——
//           我对外说的是"只动这一族"，这条断言就是那句话的凭据。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-persistence-jsonl'
const ID = 'truncated-first-frame-A4'
const MARKER = 'dsh-mobile truncated first frame diagnosis (A4)'
const OLD_STMT = 'if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");'
const UNTOUCHED_DONE = ['if (first.done) throw new Error("empty or header-less Zstandard session log");',
  'if (header.done) throw new Error("empty or header-less Zstandard session log");',
  'if (headerFrame.done) throw new Error("empty or header-less Zstandard session log");']

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a4b-test-'))
try {
  const fixture = readFileSync(versionedFixture('dsh-session-persistence-jsonl', 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')
  const target = join(scratch, PKG, 'lib', 'index.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, fixture)
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-session-persistence-jsonl', 'package.json')))

  // 前置：夹具里必须**恰好三处**旧语句（否则后面的计数断言没有意义）
  const fixtureHits = fixture.split(OLD_STMT).length - 1
  check('前置：真产物夹具里旧语句恰好 3 处', fixtureHits === 3, 'got ' + fixtureHits)

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅本补丁）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 数 = 3（三处站点都换了）', (patched.split(MARKER).length - 1) === 3, 'got ' + (patched.split(MARKER).length - 1))
  check('反 no-op：旧语句形态一处不剩', !patched.includes(OLD_STMT))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)
  check('三处缩进各自保留（1 tab ×2 ＋ 2 tab ×1）',
    patched.includes('\tif (frames.length === 0) throw new Error(tornStart === void 0')
    && patched.includes('\t\tif (frames.length === 0) throw new Error(tornStart === void 0'))

  check('未收的三处不可达分支原样保留（凭据：我只动这一族）',
    UNTOUCHED_DONE.every((s) => patched.includes(s)))
  check('非 zstd 的四处 headerEnd 站点原样保留',
    (patched.split('if (headerEnd === -1) throw new Error("empty or header-less session log");').length - 1) === 3
    && (patched.split('throw new Error("empty or header-less session log");').length - 1) >= 4)

  // ── ③ 行为：把其中一处的**新语句原文**抽出来，用桩驱动 ──
  const HEAD = 'if (frames.length === 0) throw new Error(tornStart === void 0'
  const TAIL = '(the artifact was cut short)`);'
  const start = patched.indexOf(HEAD)
  const tEnd = patched.indexOf(TAIL, start)
  if (start < 0 || tEnd < 0) throw new Error('注入语句未找到')
  const stmt = patched.slice(start, tEnd + TAIL.length)
  const run = new Function('frames', 'tornStart', stmt)
  const catchOf = (fn) => { try { fn(); return null } catch (e) { return e } }

  const empty = catchOf(() => run([], undefined))
  check('真空（tornStart 为 undefined）⇒ 抛「空」诊断', empty instanceof Error && /empty Zstandard session log/.test(empty.message), String(empty))
  check('真空诊断里**不许**出现 truncated', empty !== null && !/truncated/.test(empty.message), empty && empty.message)

  const torn0 = catchOf(() => run([], 0))
  check('首帧残缺（tornStart=0）⇒ 抛「截断」诊断', torn0 instanceof Error && /truncated Zstandard session log/.test(torn0.message), String(torn0))
  check('截断诊断点名起点字节 0', torn0 !== null && /byte 0\b/.test(torn0.message), torn0 && torn0.message)
  check('截断诊断里**不许**再说 empty / header-less', torn0 !== null && !/empty|header-less/.test(torn0.message), torn0 && torn0.message)

  const torn1234 = catchOf(() => run([], 1234))
  check('截断诊断带上实际起点字节（1234）', torn1234 !== null && /byte 1234\b/.test(torn1234.message), torn1234 && torn1234.message)

  const withFrame = catchOf(() => run([{ start: 0, end: 8 }], undefined))
  check('有帧时不许抛（原语义保住）', withFrame === null, String(withFrame))

  // ── ④ 钉住「外层包装不动」这句对外承诺 ──
  check('外层 catch 仍以 corrupt 包装（交付里"读数会怎么变"那句的凭据）',
    patched.includes('stored log is corrupt: ${String(error)} (raw log: ${path})'),
    '未找到 decodeStoredLog 的 corrupt 包装行')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
