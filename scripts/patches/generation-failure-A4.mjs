/**
 * generation-failure-A4 — `generationFailure` 不再把**未识别的**异常一律断言成「日志损坏」。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js`
 * 的 `generationFailure(id, selected, error)`（published 第 2766-2774 行）。
 *
 * rc.2 现状（逐字）：
 *   if (error instanceof SessionFormatUnsupportedError || error instanceof SessionPersistenceCorruptionError
 *       || isErrnoException(error) || error instanceof DOMException && error.name === "AbortError") return error;
 *   return new SessionPersistenceCorruptionError(`session "${id}": stored log is corrupt: ${String(error)} …`, { cause: error });
 *
 * ⇒ 最后一个兜底把**任何**没被上面识别的异常都断言成「stored log is corrupt」。
 *   已在 rc.2 上证明的具体误报：generation 层的 `JsonlGenerationTargetConflictError`
 *   （published 第 1590 行声明、第 2060 行抛出，由 `publishStoredMigration` → `migration.value.publish()`
 *   进入本函数）**不在**上面的识别集里 ⇒ 一次发布冲突会被报成日志损坏。
 *
 * 本补丁只改兜底那一步：能被识别的照旧原样放行；不能识别的**原样抛出**，不再替它下"损坏"的结论。
 * 只有抛出物根本不是 Error 时才包一层 —— 而那时也不再声称 corrupt。
 *
 * ★ 为什么不是「把类型也换掉」：seam 的错误词表里**没有**"内部/传输失败"这一员
 *   （`session-persistence/src/errors.ts` 只有 NotFound/AlreadyExists/AlreadyOwned/ReadOnly/
 *   OwnershipLost/HandleClosed/Corruption/FormatUnsupported）。给官方发布的 seam 加一员是**上游 API 变更**，
 *   应当提案而不是顺手塞进补丁。本补丁因此保留类型、只去掉那个**没根据的断言**。
 *
 * ★ 影响面已实测（不是推断）：本函数的三个调用点全在**读正文 / 迁移发布**路径
 *   （`loadStoredMigration` / `prepareStoredMigration` / `publishStoredMigration`），
 *   **不在** `readGenerationHeader` 上 ⇒ `listArtifacts()` 的 `SessionFormatUnsupportedError ||
 *   SessionPersistenceCorruptionError → continue` 跳过语义**不受影响**（那条路径不经过本函数）。
 */

export const GENERATION_FAILURE_MARKER = 'dsh-mobile generation failure honesty (A4)'

const T = '\t'

const BEFORE = T + T + 'return new SessionPersistenceCorruptionError(`session "${id}": stored log is corrupt: ${String(error)} (raw log: ${selected.sourcePath})`, { cause: error });'

const AFTER = [
  T + T + '/* ' + GENERATION_FAILURE_MARKER + ': 兜底不许替未识别的失败下"损坏"的结论。',
  T + T + ' * 已经证明的误报：JsonlGenerationTargetConflictError（generation 层发布冲突）走的就是这一行。',
  T + T + ' * 能识别的照旧原样放行；不能识别的原样抛出，让 caller 按"读不了"而不是"坏了"处理。',
  T + T + ' * seam 词表没有"内部失败"这一员，故只有非 Error 抛出物才需要包一层。 */',
  T + T + 'return error instanceof Error ? error : new SessionPersistenceCorruptionError(`session "${id}": stored log could not be read: ${String(error)} (raw log: ${selected.sourcePath})`);',
].join('\n')

const ANCHOR_FN = 'generationFailure(id, selected, error) {'

export function planGenerationFailure(source) {
  if (source.includes(GENERATION_FAILURE_MARKER)) return source
  if (!source.includes(ANCHOR_FN)) throw new Error('generation-failure-A4 anchor mismatch: generationFailure(id, selected, error) shape changed')
  const parts = source.split(BEFORE)
  if (parts.length !== 2) throw new Error(`generation-failure-A4 anchor mismatch (catch-all): expected exactly one hit, got ${parts.length - 1}`)
  return parts.join(AFTER)
}
