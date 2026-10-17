/**
 * negative-verdict-diagnostic-A7b — 否定判决缓存**只加读数出声**，不动重试策略。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-client-modules/lib/index.js`
 *   字段 `:510`  `pkgMeta = new Map();`
 *   命中 `:704`  `if (cached !== void 0) return cached;`
 *   写入 `:707`  （解析不到包根）／`:715`（读到了 manifest，但不是 client 行）
 *
 * 苏青青 1017「判决两件与其余待判项」第 7 条判：**分两步收 —— 先只加诊断（命中否定缓存时出声），
 * 重试策略后议**。所以本补丁**只读不改行为**：不缩短缓存寿命、不改重试、不换判据。
 *
 * ★ 为什么要把两种否定判决**分开**（这是本补丁唯一的设计取舍，已机器核实）：
 *   上游同一个 `null` 装了两件不同的事 ——
 *     ㈠ `:706-707` **解析不到包根**（`locatePkgJson` 返回 undefined）；
 *        上游源码注释逐字：「Not a resolvable package root: loader builtins (cordis:include) and
 *        subpath entries (…/gateway) land here — permanently not a client row.」
 *     ㈡ `:714-715` **读到了 manifest，但它说不是 client 插件**（`decl` 未定义或 platform !== "web"）。
 *   ㈡ 是**稳定事实**（真的读了文件）；㈠ 可能是**一次瞬时解析失败被永久钉死** ——
 *   那才是会让人冤枉「缺行」的机制（上游 `:601-602` 注释：「Negative verdicts remain stable until restart.」）。
 *   ⇒ 只对㈠出声；㈡ 只计数不出声（否则每个合法的非 client 包都要喊一次，那是狼来了）。
 *
 * ★ 出声频率：只在第 **1,2,4,8…** 次命中时出声（`hits & (hits-1) === 0`），
 *   既拿到「它到底被查了几次」的读数，又不每轮刷屏。
 *
 * ★ 行为零变化：`pkgMeta` 的读写、`null` 语义、返回路径**一个字节都没改**，只多了一个侧表与计数。
 */

export const NEGATIVE_VERDICT_MARKER = 'dsh-mobile negative verdict diagnostic (A7b)'

const T = '\t'

const FIELD_BEFORE = T + 'pkgMeta = /* @__PURE__ */ new Map();'
const FIELD_AFTER = [
  FIELD_BEFORE,
  T + '/* ' + NEGATIVE_VERDICT_MARKER + ': 侧表，只记"哪种否定判决、被查了几次"，不改 pkgMeta 语义。 */',
  T + 'dshMobileNegative = /* @__PURE__ */ new Map();',
].join('\n')

const HIT_BEFORE = T + T + 'if (cached !== void 0) return cached;'
const HIT_AFTER = [
  T + T + 'if (cached !== void 0) {',
  T + T + T + '/* ' + NEGATIVE_VERDICT_MARKER + ': 命中否定判决时记一次读数。pkgMeta 语义不变。 */',
  T + T + T + 'if (cached === null) this.dshMobileNoteNegativeHit(sourceKey);',
  T + T + T + 'return cached;',
  T + T + '}',
].join('\n')

const SITE_A_BEFORE = [
  T + T + 'if (located === void 0) {',
  T + T + T + 'this.pkgMeta.set(sourceKey, null);',
].join('\n')
const SITE_A_AFTER = [
  T + T + 'if (located === void 0) {',
  T + T + T + 'this.pkgMeta.set(sourceKey, null);',
  T + T + T + '/* ' + NEGATIVE_VERDICT_MARKER + ': 这一种是"解析不到包根"——可能是瞬时失败被永久钉死，所以要出声。 */',
  T + T + T + 'this.dshMobileNegative.set(sourceKey, { kind: "unresolvable", loaderName, hits: 0 });',
].join('\n')

const SITE_B_BEFORE = [
  T + T + 'if (decl === void 0 || decl.platform !== "web") {',
  T + T + T + 'this.pkgMeta.set(sourceKey, null);',
].join('\n')
const SITE_B_AFTER = [
  T + T + 'if (decl === void 0 || decl.platform !== "web") {',
  T + T + T + 'this.pkgMeta.set(sourceKey, null);',
  T + T + T + '/* ' + NEGATIVE_VERDICT_MARKER + ': 这一种是"读到 manifest、它说不是 client 插件"——稳定事实，只计数不出声。 */',
  T + T + T + 'this.dshMobileNegative.set(sourceKey, { kind: "not-a-client-row", loaderName, hits: 0 });',
].join('\n')

const METHOD_ANCHOR = T + 'resolveMeta(loaderName, baseUrl) {'
const METHOD_INSERT = [
  T + '/** Count consulted negative verdicts; speak only for the suspicious kind. */',
  T + 'dshMobileNoteNegativeHit(sourceKey) {',
  T + T + 'const state = this.dshMobileNegative.get(sourceKey);',
  T + T + 'if (state === void 0) return;',
  T + T + 'state.hits += 1;',
  T + T + 'if (state.kind !== "unresolvable") return;',
  T + T + 'const logger = this.ctx && this.ctx.logger;',
  T + T + 'if (!logger || typeof logger.warn !== "function") return;',
  T + T + '/* 只在 1,2,4,8… 次出声：既拿到"被查了几次"的读数，又不刷屏。 */',
  T + T + 'if ((state.hits & (state.hits - 1)) !== 0) return;',
  T + T + 'logger.warn(`[client-modules] "${state.loaderName}" is pinned as "no resolvable package root" until restart '
    + '(consulted ${state.hits}x, raw: ${sourceKey}). Negative verdicts are permanent by design, so if this entry is '
    + 'expected to be a client row, this pin is why it never reaches the boot graph.`);',
  T + '}',
  '',
].join('\n')

function replaceOnce(source, before, after, what) {
  const parts = source.split(before)
  if (parts.length !== 2) throw new Error(`negative-verdict-diagnostic-A7b anchor mismatch (${what}): expected exactly one hit, got ${parts.length - 1}`)
  return parts.join(after)
}

export function planNegativeVerdictDiagnostic(source) {
  if (source.includes(NEGATIVE_VERDICT_MARKER)) return source
  let out = replaceOnce(source, FIELD_BEFORE, FIELD_AFTER, 'field')
  out = replaceOnce(out, HIT_BEFORE, HIT_AFTER, 'cache hit')
  out = replaceOnce(out, SITE_A_BEFORE, SITE_A_AFTER, 'unresolvable verdict')
  out = replaceOnce(out, SITE_B_BEFORE, SITE_B_AFTER, 'not-a-client-row verdict')
  out = replaceOnce(out, METHOD_ANCHOR, METHOD_INSERT + METHOD_ANCHOR, 'helper method')
  return out
}
