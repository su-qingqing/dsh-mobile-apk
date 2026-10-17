// required-sections-A1.test.mjs — A1 补丁回归：required prompt section 在组装瀑布之后**缺席即抛**。
//
// 本测试：① 对只读 rc.2 真产物夹具跑生产 CLI（apply-patches --apply --only required-sections-A1），
//          验 marker = 1、幂等、node --check 可解析；
//        ② 把**注入进去的那段代码原文**抽出来，用桩驱动它，验行为而不是验字符串：
//           无 required 时不改变任何东西（dormant）；required 在场则原样返回；
//           required 缺席则抛，且错误里点名是哪个 section。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { versionedFixture } from './lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const PKG = 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt'
const ID = 'required-sections-A1'
const MARKER = 'dsh-mobile required prompt sections (A1)'
const TYPES_MARKER = 'dsh-mobile required prompt section type (A1)'

const failures = []
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

const scratch = mkdtempSync(join(tmpdir(), 'a1-test-'))
try {
  // 夹具是**未施加任何本方补丁**的真产物；package.json 必须一并落位，
  // 否则 lib/index.js 会被 node 当成 CJS 解析（那边是 ESM）。
  const target = join(scratch, PKG, 'lib', 'index.js')
  const types = join(scratch, PKG, 'lib', 'types', 'index.d.ts')
  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(types), { recursive: true })
  writeFileSync(target, readFileSync(versionedFixture('dsh-system-prompt', 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(types, readFileSync(versionedFixture('dsh-system-prompt', 'lib', 'types', 'index.d.ts'), 'utf8').replace(/\r\n/g, '\n'))
  writeFileSync(join(scratch, PKG, 'package.json'), readFileSync(versionedFixture('dsh-system-prompt', 'package.json')))

  const apply = () => spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'patches', 'apply-patches.mjs'), scratch, '--apply', '--scope', 'engine', '--only', ID],
    { encoding: 'utf8' })
  const applied = apply()
  check('apply-patches exits 0（仅 A1）', applied.status === 0, (applied.stderr || '').trim().split('\n').slice(-2).join(' '))
  const patched = readFileSync(target, 'utf8')
  check('marker 数 = 1', (patched.match(new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1)
  check('反 no-op：两条出口都过了核对', patched.includes('return dshMobileAssertRequiredSections(transformed);')
    && patched.includes('return dshMobileAssertRequiredSections({'))
  const parsed = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  check('打过补丁的产物可被 node 解析', parsed.status === 0, (parsed.stderr || '').split('\n')[0])
  check('公开类型面补上 required', readFileSync(types, 'utf8').includes(TYPES_MARKER)
    && readFileSync(types, 'utf8').includes('readonly required?: boolean;'))
  apply()
  check('再施加零改动（幂等）', readFileSync(target, 'utf8') === patched)

  /* ★ 反静默失效（本轮自查补的盲点）：
   * 本补丁靠 `sectionDefinitions` 里**注册时那个对象**上的 `required` 字段。而 `sectionDefinitions`
   * 来自 `sectionByName.values()`，后者由 `section()` 填充。所以整条能力成立的前提是
   * **`section()` 原样保存注册对象、不解构**。rc.2 真产物核实过（lib/index.js:240-243）：
   *     section(section) {
   *       if (!Number.isFinite(section.order)) throw new TypeError(...);
   *       return this.layers.effect(this.ctx, (layer) => layer.sections.insert(section.name, section), ...);
   *     }
   * 只读 order/name，其余原样插入 ⇒ required 能活到 sectionDefinitions。
   * 但**这个前提不在我的补丁里、在上游** —— 上游哪天改成解构（只挑 name/order/text/interpolate/complete），
   * 我的补丁就变成**静默 no-op**：不报错、不判红、`required: true` 永远不生效。这里把它钉住。
   * 为什么钉字符串而不是跑行为：驱动真 `section()` 需要 cordis 的 Service/ScopedLayers 全套，
   * 而这条断言要防的正是「上游形态变了」，形态判据比行为判据更贴合它要防的东西。 */
  check('注册路径仍原样保存 section 对象（否则 required 会静默失效）',
    /layer\.sections\.insert\(section\.name, section\)/.test(patched),
    '未找到 layer.sections.insert(section.name, section) —— section() 可能已改成解构')

  // 反静默失效②：required 必须取自**注册定义**、核对对象必须是**最终 assembly**。
  // 两者不是同一个对象（assembly 只带 name/text/interpolate），取错一侧就永远不抛。
  check('required 取自注册定义（sectionDefinitions）', patched.includes('const dshMobileRequiredSections = sectionDefinitions.filter((section) => section.required === true);'))
  check('核对对象是最终 assembly（finalAssembly.sections）', patched.includes('!finalAssembly.sections.some((section) => section.name === required.name)'))

  // ── 行为：抽出注入块原文，用桩驱动 ──
  const start = patched.indexOf('const dshMobileRequiredSections = sectionDefinitions.filter')
  const endMarker = '\n\t\t};'
  const end = patched.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error('注入块未找到')
  const block = patched.slice(start, end + endMarker.length)
  const assertorFor = (defs) => new Function('sectionDefinitions', block + '\nreturn dshMobileAssertRequiredSections;')(defs)

  // ① dormant：没有任何 section 声明 required ⇒ 无论 assembly 长什么样都不抛、且原对象原样返回
  const dormant = assertorFor([{ name: 'a' }, { name: 'b', complete: true }])
  const empty = { sections: [], contexts: [] }
  let dormantResult
  let dormantThrew = false
  try { dormantResult = dormant(empty) } catch { dormantThrew = true }
  check('无 required 时零行为变化（不抛且原对象返回）', !dormantThrew && dormantResult === empty)

  // ② required 在场：原样返回同一个对象（不改内容）
  const present = assertorFor([{ name: 'a', required: true }, { name: 'b' }])
  const okAssembly = { sections: [{ name: 'a', text: 'x' }, { name: 'b', text: 'y' }] }
  let presentResult
  let presentThrew = false
  try { presentResult = present(okAssembly) } catch { presentThrew = true }
  check('required section 在场时原样返回', !presentThrew && presentResult === okAssembly)

  // ③ required 缺席：抛，且点名
  const missing = { sections: [{ name: 'b', text: 'y' }] }
  let thrown
  try { present(missing) } catch (error) { thrown = error }
  check('required section 缺席即抛', thrown instanceof Error, String(thrown))
  check('错误点名是哪个 section', thrown !== undefined && thrown.message.includes('"a"'), thrown === undefined ? 'no throw' : thrown.message)

  // ④ 文档化的连带后果：complete section 会把 sections 收成 [completeSection]，
  //    此时非 complete 的 required section 必然缺席 ⇒ 必须响亮失败而不是静默少读
  const withComplete = { sections: [{ name: 'b', text: 'y' }] }
  let completeThrew
  try { present(withComplete) } catch (error) { completeThrew = error }
  check('complete 覆盖掉 required 时同样判红（不静默）', completeThrew instanceof Error && completeThrew.message.includes('"a"'))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(failures.length === 0 ? '\nALL PASS' : '\nFAILED ' + failures.length + ': ' + failures.join('; '))
process.exit(failures.length === 0 ? 0 : 1)
