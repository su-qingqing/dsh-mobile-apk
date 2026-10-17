// reload-restart-report-A3.test.mjs — A3 补丁回归：无 HMR 时 reload() 不再静默返回空清单。
//
// 本测试：① 对只读 rc.2 真产物夹具跑生产 CLI（--only reload-restart-report-A3），验 marker/幂等/可解析；
//        ② 把**注入进去的代码原文**抽出来，用桩驱动，验行为：
//           - 无 HMR：传入 requiredIds ⇒ 报出点名清单；不传 ⇒ 仍返回 []（不许凭空报）；
//           - 有 HMR：仍然委派给 reconcileProfilePatches（原路径不许被改掉）；
//           - change() 的门闩：changed=false 时**不许**报（防报假），application=applied 时不许报，
//             已有 warning 时不重复追加。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-plugin-manager'
const ID = 'reload-restart-report-A3'
const MARKER = 'dsh-mobile reload restart report (A3)'

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a3-test-'))
try {
  const target = join(scratch, PKG, 'lib', 'index.js')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(versionedFixture('dsh-plugin-manager', 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-plugin-manager', 'package.json')))

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅 A3）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 出现（无 HMR 分支 + change 门闩共 2 处）', (patched.match(/dsh-mobile reload restart report \(A3\)/g) || []).length === 2,
    'count=' + (patched.match(/dsh-mobile reload restart report \(A3\)/g) || []).length)
  check('反 no-op：无 HMR 分支不再是裸 return []', !patched.includes('if (this.ownerContext.get("hmr") === void 0) return [];'))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)

  // ── 行为①：reload() 的无 HMR 分支 ──
  const mStart = patched.indexOf('async reload(requiredIds = []) {')
  const mEnd = patched.indexOf('\n\t\t}\n', mStart) + '\n\t\t}'.length
  if (mStart < 0 || mEnd <= mStart) throw new Error('reload() 未找到')
  const reloadSrc = patched.slice(mStart, mEnd)
  let reconcileCalls = 0
  const build = (ownerContext) => {
    const obj = new Function('reconcileProfilePatches', 'readProfilePatches',
      'return ({ ' + reloadSrc + ' });')(
      (...args) => { reconcileCalls += 1; return ['from-hmr', ...args.slice(3)] },
      () => ['patch-row'])
    obj.ownerContext = ownerContext
    return obj
  }

  const noHmr = build({ get: () => undefined })
  const withIds = await noHmr.reload(['row-a', 'row-b'])
  check('无 HMR + 有 requiredIds ⇒ 报出待生效清单', Array.isArray(withIds) && withIds.length === 1
    && withIds[0].includes('row-a') && withIds[0].includes('row-b') && /no HMR/.test(withIds[0]), JSON.stringify(withIds))

  const noIds = await build({ get: () => undefined }).reload([])
  check('无 HMR + 无 requiredIds ⇒ 仍返回 []（不许凭空报）', Array.isArray(noIds) && noIds.length === 0, JSON.stringify(noIds))

  const blankIds = await build({ get: () => undefined }).reload(['', undefined, null, 'ok'])
  check('无 HMR：只保留非空字符串 id', blankIds.length === 1 && blankIds[0].includes('ok') && !blankIds[0].includes('undefined'), JSON.stringify(blankIds))

  reconcileCalls = 0
  const withHmr = await build({ get: () => ({ runExclusive: (fn) => fn() }) }).reload(['row-a'])
  check('有 HMR ⇒ 原路径未被改掉（仍委派 reconcileProfilePatches）', reconcileCalls === 1 && withHmr[0] === 'from-hmr', JSON.stringify(withHmr))

  // ── 行为②：change() 的门闩 ──
  const gStart = patched.indexOf('if (result.changed && result.application === "restart-required"')
  const gEnd = patched.indexOf('\n', gStart)
  if (gStart < 0) throw new Error('change() 门闩未找到')
  const gate = new Function('result', patched.slice(gStart, gEnd))

  const changed = { changed: true, application: 'restart-required' }
  gate(changed)
  check('changed 且 restart-required ⇒ 补一条待重启提示', Array.isArray(changed.warnings) && changed.warnings.length === 1
    && /restart/.test(changed.warnings[0]), JSON.stringify(changed.warnings))

  const notChanged = { changed: false, application: 'restart-required' }
  gate(notChanged)
  check('反报假：没改动时不报', notChanged.warnings === undefined, JSON.stringify(notChanged.warnings))

  const appliedLive = { changed: true, application: 'applied' }
  gate(appliedLive)
  check('有 HMR（applied）时不报', appliedLive.warnings === undefined, JSON.stringify(appliedLive.warnings))

  const alreadyWarned = { changed: true, application: 'restart-required', warnings: ['from reload'] }
  gate(alreadyWarned)
  check('已有 warning 时不重复追加', alreadyWarned.warnings.length === 1 && alreadyWarned.warnings[0] === 'from reload', JSON.stringify(alreadyWarned.warnings))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
