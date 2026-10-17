/**
 * inject-miss-diagnosis-A7a — `require` 没命中模块表时，**点名消费者行 id 与缺失包名**。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-client-modules/lib/client.js:697-715` 的
 * `makeRequire(ownerId, edges)`，改的是其中 `:705` 那一行 `throw`。
 *
 * 上游原文（逐字）：
 *   `throw new Error(\`client-modules: require("${spec}") missed the module table — not a platform
 *    seed word, not a materialized module, and no registered package factory (a build-time externals
 *    drift, or a dynamic dependency that did not arrive)\`);`
 *
 * 为什么这么改（苏青青 1017 判决 · A7(a) 判 **A7a-1**）：
 *   现在生产现场只知道「**N entries did not activate**」，**不告诉你缺的是谁、谁在等它**。
 *   而 `ownerId`（消费者行 id）**已经在作用域里**、`spec`（缺的包）也在，**两条一写进消息**，
 *   「gateway 该在却不在」就**当场点名**。
 *
 * ★ 为什么这是**零假阳性**的那条路（她判的第一条理由）：`inject` 是"声明顺序"，不是"必须能解析到"；
 *   只有**真有人 `require` 而它不在图上**时才会走到这个 `throw`。所以
 *   「`@deepseek-ai/dsh-client-ui-primitives` 是共享 UI 库、被 5 行 inject 但不是图行」那种情形
 *   **天然不会触发** —— 我先前实测 34 条 inject 边里那唯一 1 条不是图行的，走的从来不是这里。
 *   （所以也**不需要**把那个 `inject` 缺行的 `if` 改成出声 —— 那才会误报 5 条假失败。）
 *
 * ★ 附带的第二段（我加的、她认的"不缺的那条信息"）：若该消费者行**确实声明过**这个包
 *   （`dsh.client.inject` 里有它），消息再加一句「它的 client 插件行不在 boot 图里」——
 *   把「声明了却不在图上」与「压根没声明、只是动态要用」分开。
 *
 * ★ 语法面：这段代码跑在**浏览器**（client bundle），构建链有 chrome87 语法下限门禁。
 *   所以刻意**不用** `??` / `?.` / 可选链，改用 `=== void 0` 与 `|| []`，与文件既有风格一致。
 */

export const INJECT_MISS_MARKER = 'dsh-mobile inject-miss diagnosis (A7a)'

const T = '\t'

/** 逐字锚点：`makeRequire` 里那条 throw（4 个 tab，`spec` 用模板串插值）。 */
const BEFORE = T + T + T + T + 'throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`);'

const AFTER = [
  T + T + T + T + '/* ' + INJECT_MISS_MARKER + ': 这一行原本只说"require 没命中模块表"，',
  T + T + T + T + ' * 不说是**谁**在要、也不说那个包**是不是本该在图上**。ownerId 就在作用域里。',
  T + T + T + T + ' * 只在真有人 require 且三层都 miss 时才走到这里 ⇒ 按构造不会误报。 */',
  T + T + T + T + 'const dshMobileOwner = this.graphRows.get(ownerId);',
  T + T + T + T + 'const dshMobileInjects = dshMobileOwner === void 0 ? [] : dshMobileOwner.inject || [];',
  T + T + T + T + 'const dshMobileDeclared = dshMobileInjects.some((name) => stripClientSuffix(name) === id);',
  T + T + T + T + 'throw new Error(`client-modules: "${ownerId}" required "${spec}" but it missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`',
  T + T + T + T + T + '+ (dshMobileDeclared ? ` — note: "${ownerId}" declares "${spec}" in dsh.client.inject, yet no boot-graph row provides it (its client plugin row is absent from graph.entries)` : \'\'));',
].join('\n')

export function planInjectMissDiagnosis(source) {
  if (source.includes(INJECT_MISS_MARKER)) return source
  const parts = source.split(BEFORE)
  if (parts.length !== 2) throw new Error(`inject-miss-diagnosis-A7a anchor mismatch: expected exactly one hit, got ${parts.length - 1}`)
  return parts.join(AFTER)
}
