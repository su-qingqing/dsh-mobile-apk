/**
 * truncated-first-frame-A4 — 残缺首帧不再被说成「空／无 header」（**同一族三处一次收干净**）。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js`
 * 里**三条**同一句话：
 *   :1769  decodeStreamingMigration（历史代次迁移）
 *   :1860  decodeCurrentGeneration（worker 校验）
 *   :2941  readZstdPrefix（当前代读取）
 * 三处都是逐字：
 *   `if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");`
 * 差别只在缩进（前两处 1 个 tab，第三处 2 个）。所以本模块**按缩进捕获后逐处替换**，
 * 并**断言命中数恰好 3**（少一处就是族没收干净，多一处就是上游形态变了 —— 两种都判红）。
 *
 * 为什么是误标（苏青青 1017 判决 · 第 9 条 判「收」）：
 *   被**截断**的日志会走到这三行，然后被 `decodeStoredLog` 的 catch（真产物 :2817）包成
 *   `stored log is corrupt` ⇒ 排查者先读到「空/无 header」、再读到「损坏」，两个结论都不是事实。
 *
 * ★ 判据（已机器核实，不是断言）：`scanZstdFrames`（源码 zstd.ts:48-99 / 真产物 :1300）的循环是
 *   `while (offset < buffer.length)`，六处 torn 分支均 `return { frames, tornStart: start }`：
 *     - 空 buffer（length===0）⇒ 循环体一次都不进 ⇒ `{ frames: [], tornStart: undefined }`
 *     - 首帧残缺 ⇒ `{ frames: [], tornStart: <start> }`
 *     - magic 坏 ⇒ 直接 throw `invalid frame magic`
 *   三处的上下文都已把 `tornStart` 解构出来（`:1768` / `:1859` / `:2939` 逐字
 *   `const { frames, tornStart } = scanZstdFrames(bytes|buffer);`），故判据在三处都成立。
 *
 * ★ 没动的（如实登记，等她判）：
 *   同族另有三处**不同条件**的同一句文案 —— `:1775` `if (first.done)`、`:1867` `if (header.done)`、
 *   `:2950` `if (headerFrame.done)`，三处上游都标了 `/* v8 ignore next *​/`（非空帧表下不可达）。
 *   它们说的是「解码器对非空帧表一个都没产出」，与「文件被截断」不是同一件事，故不在本补丁内。
 *   另有四处**非 zstd** 的 `empty or header-less session log`（`:971` / `:1127` / `:1761` / `:1854`，
 *   条件是 `headerEnd === -1`，即纯 JSONL 里连换行都没有）—— 也不在本补丁内。
 */

export const TRUNCATED_FIRST_FRAME_MARKER = 'dsh-mobile truncated first frame diagnosis (A4)'

/** 同一族的站点数：少一处＝没收干净，多一处＝上游形态变了。两种都必须判红。 */
export const EXPECTED_SITES = 3

const T = '\t'

/** 逐字锚点；捕获前导缩进，好把每个站点原地换掉而不动它的排版。 */
const SITE = /([ \t]*)if \(frames\.length === 0\) throw new Error\("empty or header-less Zstandard session log"\);/

export function planTruncatedFirstFrame(source) {
  // 幂等：先判已施加（施加后那三条语句的形态已经变了，不能再按计数走）。
  if (source.includes(TRUNCATED_FIRST_FRAME_MARKER)) return source
  const hits = source.match(new RegExp(SITE.source, 'g')) ?? []
  if (hits.length !== EXPECTED_SITES) {
    throw new Error(`truncated-first-frame-A4 anchor mismatch: expected ${EXPECTED_SITES} sites, got ${hits.length}`
      + '（少一处 = 族没一次收干净；多一处 = 上游形态已变，请人工核对）')
  }
  return source.replace(new RegExp(SITE.source, 'g'), (_all, indent) => [
    `${indent}/* ${TRUNCATED_FIRST_FRAME_MARKER}: 真空与「首帧残缺（文件被截断）」分开诊断。`,
    `${indent} * scanZstdFrames 已把截断起点放在 tornStart 里，别再把它说成 header-less。 */`,
    `${indent}if (frames.length === 0) throw new Error(tornStart === void 0`,
    `${indent}${T}? "empty Zstandard session log: the artifact carries no bytes at all"`,
    `${indent}${T}: \`truncated Zstandard session log: the first frame is incomplete from byte \${tornStart} (the artifact was cut short)\`);`,
  ].join('\n'))
}
