/**
 * required-sections-A1 — 让 `required: true` 的 prompt section 在组装瀑布之后**缺席即抛**。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-system-prompt/lib/index.js` 的 `assemble()`。
 * 上游只对 `complete` section 做了特殊处理（`multiple complete prompt sections are active`），
 * 一个声明为必需（`required`）的 section 仍可能被后面的瀑布 listener 丢掉，而模型会**静默少读**它。
 *
 * 本补丁做三件事，全部是**加法**：
 *   1. 收集 `sectionDefinitions` 里 `required === true` 的名字；
 *   2. 在 `assemble()` 最终返回的值上逐个核对，缺席即抛（与既有 complete 抛错同层）；
 *   3. 在公开类型 `lib/types/index.d.ts` 的 `PromptSection` 上补 `required?: boolean`。
 *
 * ★ 现状下**没有任何** section 声明 `required`，所以对既有配置**行为零变化**（dormant capability）；
 *   一旦有 profile 声明它、而又同时存在 `complete` section（后者会被恢复成**唯一** section），
 *   本补丁会让它**响亮地失败**而不是静默丢失 —— 这正是「缺席即抛」的语义。
 */

export const REQUIRED_SECTIONS_MARKER = 'dsh-mobile required prompt sections (A1)'
export const REQUIRED_SECTIONS_TYPES_MARKER = 'dsh-mobile required prompt section type (A1)'

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

const DTS_ANCHOR = '    readonly complete?: boolean;'
const DTS_INSERT = [
  '    /**',
  '     * ' + REQUIRED_SECTIONS_TYPES_MARKER + ': this section must survive the assembly',
  '     * waterfall. Assembly throws when a required section is missing from the',
  '     * assembly it returns, including when a complete section replaced it.',
  '     */',
  '    readonly required?: boolean;',
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

export function planRequiredSectionTypes(source) {
  if (source.includes(REQUIRED_SECTIONS_TYPES_MARKER)) return source
  return replaceOnce(source, DTS_ANCHOR, DTS_ANCHOR + '\n' + DTS_INSERT, 'types')
}
