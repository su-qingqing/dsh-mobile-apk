/**
 * reload-restart-report-A3 — 无 HMR 的 profile 里，`reload()` 不再**静默返回空清单**。
 *
 * 落点（rc.2 真实发布字节）：`@deepseek-ai/dsh-plugin-manager/lib/index.js`。
 *
 * rc.2 现状（逐字）：
 *   `async reload(requiredIds = []) { if (this.ownerContext.get("hmr") === void 0) return []; … }`
 *   `change()` 里 `application: … "applied" : "restart-required"`（**rc.2 没有 `restartReason` 字段**）。
 *   `reload()` 的返回值落进 `result.warnings`（`reload()` 5 个调用点全在 `change()` 的 operation 里）。
 *
 * ⇒ 引擎**自己知道**这次改动要重启才生效（`application:'restart-required'`，客户端也已显示），
 *   却把「到底什么待生效」吞成空数组。本补丁只做两处加法：
 *   1. 无 HMR 分支：把调用方**已经传进来的** `requiredIds`（本次涉及的 patch 行 id）报成待生效清单；
 *   2. `change()`：**只在磁盘真的变了**（`result.changed`）且 `application === 'restart-required'`
 *      且还没有任何 warning 时，补一条「改动已落盘、重启后生效」。
 *
 * ★ 为什么门闩必须挂在 `result.changed` 上：一个空转的 change（没有改动）也走同一条分支，
 *   不门闩就会**报假**。`reload()` 单独做不到这件事（它被调用时磁盘已经写完，没有 before 可比），
 *   所以第二处落点是必要的，不是顺手改。
 */

export const RELOAD_RESTART_MARKER = 'dsh-mobile reload restart report (A3)'

const T = '\t'

const RELOAD_BEFORE = T + T + T + 'if (this.ownerContext.get("hmr") === void 0) return [];'

const RELOAD_AFTER = [
  T + T + T + '/* ' + RELOAD_RESTART_MARKER + ': 无 HMR 时上游静默 return []，于是 change() 报',
  T + T + T + ' * restart-required 却不说"什么待生效"。requiredIds 就是本次涉及的 patch 行，',
  T + T + T + ' * 它们正是"重启后才生效"的那一份清单。 */',
  T + T + T + 'if (this.ownerContext.get("hmr") === void 0) {',
  T + T + T + T + 'const dshMobilePendingIds = requiredIds.filter((requiredId) => typeof requiredId === "string" && requiredId.length > 0);',
  T + T + T + T + 'return dshMobilePendingIds.length === 0 ? [] : [`plugin patch row(s) will take effect only after a restart (this profile has no HMR): ${dshMobilePendingIds.join(", ")}`];',
  T + T + T + '}',
].join('\n')

const CHANGED_BEFORE = T + T + T + T + 'result.changed = before !== this.diskState();'

const CHANGED_AFTER = [
  CHANGED_BEFORE,
  T + T + T + T + '/* ' + RELOAD_RESTART_MARKER + ': 只有磁盘真的变了才报；空转的 change 不许报假。 */',
  T + T + T + T + 'if (result.changed && result.application === "restart-required" && (result.warnings?.length ?? 0) === 0) result.warnings = ["plugin composition changed on disk and takes effect only after a restart (this profile has no HMR)"];',
].join('\n')

function replaceOnce(source, before, after, what) {
  const parts = source.split(before)
  if (parts.length !== 2) throw new Error(`reload-restart-report-A3 anchor mismatch (${what}): expected exactly one hit, got ${parts.length - 1}`)
  return parts.join(after)
}

const ANCHOR_METHOD = 'async reload(requiredIds = []) {'

export function planReloadRestartReport(source) {
  if (source.includes(RELOAD_RESTART_MARKER)) return source
  if (!source.includes(ANCHOR_METHOD)) throw new Error('reload-restart-report-A3 anchor mismatch: reload(requiredIds) shape changed')
  let out = replaceOnce(source, RELOAD_BEFORE, RELOAD_AFTER, 'reload no-hmr branch')
  out = replaceOnce(out, CHANGED_BEFORE, CHANGED_AFTER, 'change result.changed')
  return out
}
