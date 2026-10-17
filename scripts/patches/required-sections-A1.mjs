/**
 * required-sections-A1 — 让 `required: true` 的 prompt section 在组装瀑布之后**缺席即抛**。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-system-prompt/lib/index.js` 的 `assemble()`。
 * 上游只对 `complete` section 做了特殊处理（`multiple complete prompt sections are active`），
 * 一个声明为必需（`required`）的 section 仍可能被后面的瀑布 listener 丢掉，而模型会**静默少读**它。
 *
 * 本补丁做两件事，全是**加法**：
 *   1. 收集 `sectionDefinitions` 里 `required === true` 的名字；
 *   2. 在 `assemble()` 最终返回的值上逐个核对，缺席即抛（与既有 complete 抛错同层）。
 *
 * ★ 现状下**没有任何** section 声明 `required`，所以对既有配置**行为零变化**（dormant capability）；
 *   一旦有 profile 声明它、而又同时存在 `complete` section（后者会被恢复成**唯一** section），
 *   本补丁会让它**响亮地失败**而不是静默丢失 —— 这正是「缺席即抛」的语义。
 *
 * ★★ 为什么不顺手改公开类型面 `lib/types/index.d.ts`（**这里踩过一次，记下来**）：
 *   本补丁最初**同时**改了 `.d.ts` 并在登记表里声明为 `additionalTargets`。
 *   CI（run 38990106675）在最后一道**官方** overlay 门禁上判红：
 *       [patch-marker] 缺失: required-sections-A1 (…/dsh-system-prompt/lib/types/index.d.ts)
 *   根因两条，都是机器读数：
 *     ㈠ `scripts/build-snapshot-013.mjs:1134` 逐字 —— `extensionDelete`: @deepseek-ai/dsh 子树的
 *        **.d.ts** ——「Node 执行 lib/*.js，**类型声明不参与执行**」⇒ 快照**故意删掉**这些文件；
 *     ㈡ `scripts/check-engine-overlay.mjs:139` 逐字 ——
 *        `for (const path of [patch.target, ...(patch.additionalTargets ?? [])])`
 *        ⇒ 每个声明的目标都**必须**在**已出货的快照里**带 marker。
 *   ⇒ 声明一个「打补丁时在场、出货前被删」的目标，**marker 永远不可能在场**，官方门禁必红。
 *   ⇒ 结论：对这个产品，**`.d.ts` 不是契约的一部分**（它不上平板），所以**不补它、也不声明它**。
 *     要给人读的字段说明写在交付里，不写进一个会被删掉的文件。
 */

export const REQUIRED_SECTIONS_MARKER = 'dsh-mobile required prompt sections (A1)'

const T = '\t'

/** 采集点：`complete` 抛错之后、`let completeSection;` 之前。 */
const THROW_LINE = T + T + 'if (completeSections.length > 1) throw new Error(`multiple complete prompt sections are active: ${completeSections.map((section) => JSON.stringify(section.name)).join(", ")}`);'
const COMPLETE_LET = T + T + 'let completeSection;'

const COLLECT_BEFORE = [THROW_LINE, COMPLETE_LET].join('\n')

const COLLECT_INSERT = [
  T + T + '/* ' + REQUIRED_SECTIONS_MARKER + ': 上游只特判 complete section；一个被声明为',
  T + T + ' * required 的 section 仍可能被后面的瀑布 listener 丢掉，模型会静默少读它。',
  T + T + ' * 这里收集声明，并在 assemble() 最终返回的那个 assembly 上逐个核对。',
  T + T + ' * 现状无人声明 required ⇒ 对既有配置零行为变化。 */',
  T + T + 'const dshMobileRequiredSections = sectionDefinitions.filter((section) => section.required === true);',
  T + T + 'const dshMobileAssertRequiredSections = (finalAssembly) => {',
  T + T + T + 'for (const required of dshMobileRequiredSections) {',
  T + T + T + T + 'if (!finalAssembly.sections.some((section) => section.name === required.name)) throw new Error(`required prompt section ${JSON.stringify(required.name)} is missing from the assembled prompt`);',
  T + T + T + '}',
  T + T + T + 'return finalAssembly;',
  T + T + '};',
].join('\n')

/** 整段替换（不是只换 `let` 那一行，否则首行会吃到锚点里原有的缩进，变成 4 个 tab）。 */
const COLLECT_AFTER = [THROW_LINE, COLLECT_INSERT, COMPLETE_LET].join('\n')

/** 出口：两条 return 都要过核对。 */
const RETURN_BEFORE = [
  T + T + 'if (completeSection === void 0 && !runtimeContextSuppressed) return transformed;',
  T + T + 'return {',
  T + T + T + '...transformed,',
  T + T + T + 'sections: completeSection === void 0 ? transformed.sections : [completeSection],',
  T + T + T + 'contexts: runtimeContextSuppressed ? [] : transformed.contexts',
  T + T + '};',
].join('\n')

const RETURN_AFTER = [
  T + T + 'if (completeSection === void 0 && !runtimeContextSuppressed) return dshMobileAssertRequiredSections(transformed);',
  T + T + 'return dshMobileAssertRequiredSections({',
  T + T + T + '...transformed,',
  T + T + T + 'sections: completeSection === void 0 ? transformed.sections : [completeSection],',
  T + T + T + 'contexts: runtimeContextSuppressed ? [] : transformed.contexts',
  T + T + '});',
].join('\n')

/** 只在恰好命中一处时才替换，锚点漂移立即判红（不猜、不静默空转）。 */
function replaceOnce(source, before, after, what) {
  const parts = source.split(before)
  if (parts.length !== 2) throw new Error(`required-sections-A1 anchor mismatch (${what}): expected exactly one hit, got ${parts.length - 1}`)
  return parts.join(after)
}

export function planRequiredSections(source) {
  if (source.includes(REQUIRED_SECTIONS_MARKER)) return source
  let out = replaceOnce(source, COLLECT_BEFORE, COLLECT_AFTER, 'collect')
  out = replaceOnce(out, RETURN_BEFORE, RETURN_AFTER, 'returns')
  return out
}
