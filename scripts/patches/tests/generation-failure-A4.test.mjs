// generation-failure-A4.test.mjs — A4② 补丁回归：未识别的异常不再被断言成「日志损坏」。
//
// 本测试：① 对只读 rc.2 真产物夹具跑生产 CLI（--only generation-failure-A4），验 marker/幂等/可解析；
//        ② 把 generationFailure() 的原文抽出来，用桩驱动，验行为：
//           - 已识别的（Unsupported / SourceChanged / Corruption / errno / AbortError）原样放行；
//           - JsonlGenerationTargetConflictError（generation 层发布冲突，已在 rc.2 上证明会走到这一行）
//             **原样抛出**，不再是 SessionPersistenceCorruptionError，且文案里不再出现 stored log is corrupt；
//           - 非 Error 抛出物才包一层，且文案说的是 could not be read，不是 corrupt；
//           - 上游 UnsupportedMigration 的**译制**行为必须保住（不许顺手改掉既有能力）。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-persistence-jsonl'
const ID = 'generation-failure-A4'
const MARKER = 'dsh-mobile generation failure honesty (A4)'

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a4-test-'))
try {
  const target = join(scratch, PKG, 'lib', 'index.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(versionedFixture('dsh-session-persistence-jsonl', 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-session-persistence-jsonl', 'package.json')))

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅 A4）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 数 = 1', (patched.match(/dsh-mobile generation failure honesty \(A4\)/g) || []).length === 1)
  check('反 no-op：兜底不再构造 corrupt 断言', !patched.includes('return new SessionPersistenceCorruptionError(`session "${id}": stored log is corrupt:'))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)

  // ── 行为：抽出 generationFailure 原文，用桩驱动 ──
  const mStart = patched.indexOf('generationFailure(id, selected, error) {')
  const mEnd = patched.indexOf('\n\t}\n', mStart) + '\n\t}'.length
  if (mStart < 0 || mEnd <= mStart) throw new Error('generationFailure 未找到')
  const methodSrc = patched.slice(mStart, mEnd)

  class Unsupported extends Error { constructor(message, location) { super(message); this.name = 'SessionFormatUnsupportedError'; this.location = location } }
  class Corruption extends Error { constructor(message, options) { super(message, options); this.name = 'SessionPersistenceCorruptionError' } }
  class SourceChanged extends Error { constructor(p) { super('changed: ' + p); this.name = 'JsonlGenerationSourceChangedError' } }
  class UnsupportedMigration extends Error { constructor(fromVersion, reason) { super('migration unsupported'); this.name = 'JsonlGenerationUnsupportedMigrationError'; this.fromVersion = fromVersion; this.reason = reason } }
  class TargetConflict extends Error { constructor(p) { super('target generation already exists: ' + p); this.name = 'JsonlGenerationTargetConflictError' } }
  const isErrno = (e) => typeof e?.code === 'string'

  const service = new Function(
    'JsonlGenerationUnsupportedMigrationError', 'JsonlGenerationSourceChangedError',
    'SessionFormatUnsupportedError', 'SessionPersistenceCorruptionError', 'isErrnoException', 'DOMException',
    'return ({ ' + methodSrc + ' });',
  )(UnsupportedMigration, SourceChanged, Unsupported, Corruption, isErrno, DOMException)

  const id = 'sess-1'
  const selected = { sourcePath: '/logs/sess-1.jsonl.zstd' }

  // ① 已证明的误报：generation 层发布冲突
  const conflict = new TargetConflict('/logs/sess-1/current.jsonl')
  const outConflict = service.generationFailure(id, selected, conflict)
  check('JsonlGenerationTargetConflictError 原样抛出（不再被改写成 corrupt）', outConflict === conflict,
    outConflict === conflict ? '' : String(outConflict))
  check('该分支文案里不再出现 stored log is corrupt', !String(outConflict.message).includes('stored log is corrupt'), outConflict.message)

  // ② 已识别的种类仍然原样放行
  const corrupt = new Corruption('stored log is corrupt: already classified', {})
  check('SessionPersistenceCorruptionError 原样放行', service.generationFailure(id, selected, corrupt) === corrupt)
  const unsupported = new Unsupported('session "s" uses log format v9', { kind: 'jsonl', path: '/p' })
  check('SessionFormatUnsupportedError 原样放行', service.generationFailure(id, selected, unsupported) === unsupported)
  const changed = new SourceChanged('/p')
  check('JsonlGenerationSourceChangedError 原样放行', service.generationFailure(id, selected, changed) === changed)
  const errno = Object.assign(new Error('EACCES'), { code: 'EACCES' })
  check('errno 原样放行', service.generationFailure(id, selected, errno) === errno)
  const aborted = new DOMException('aborted', 'AbortError')
  check('AbortError 原样放行', service.generationFailure(id, selected, aborted) === aborted)

  // ③ 未识别的普通 Error（例如 SessionFormatError 那样的「本 build 不支持、日志完好」拒绝）原样抛出
  class SessionFormatError extends Error { constructor(m) { super(m); this.name = 'SessionFormatError' } }
  const formatError = new SessionFormatError('released v2 row 8 has seq gap (expected 8, got 5)')
  const outFormat = service.generationFailure(id, selected, formatError)
  check('未识别的 Error 原样抛出（保住真实类身份与 cause 链）', outFormat === formatError, String(outFormat))
  check('未识别分支不再声称 corrupt', !String(outFormat.message).includes('stored log is corrupt'), outFormat.message)

  // ④ 非 Error 抛出物：仍须有 Error 可抛，但文案不再下"损坏"结论
  const outString = service.generationFailure(id, selected, 'boom')
  check('非 Error 抛出物被包成 Error', outString instanceof Error, String(outString))
  check('非 Error 分支文案是 could not be read（不是 corrupt）',
    String(outString.message).includes('could not be read') && !String(outString.message).includes('stored log is corrupt'), outString.message)
  check('非 Error 分支带上 raw log 路径', String(outString.message).includes(selected.sourcePath))

  // ⑤ 既有能力不许被顺手改掉：UnsupportedMigration 仍被译成 SessionFormatUnsupportedError
  const migration = new UnsupportedMigration(3, new Error('inner'))
  const outMigration = service.generationFailure(id, selected, migration)
  check('UnsupportedMigration 仍被译成 SessionFormatUnsupportedError（既有能力保住）',
    outMigration instanceof Unsupported && outMigration !== migration, String(outMigration))
  check('译制文案保留 fromVersion 与 raw log', String(outMigration.message).includes('v3') && String(outMigration.message).includes(selected.sourcePath), outMigration.message)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
