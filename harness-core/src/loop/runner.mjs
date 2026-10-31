/**
 * ② 终止与纠错 —— 有界 loop：目标满足就停，出错有恢复路径。
 *
 * 三条硬约束：
 *   1. maxRounds 有界 —— 不做无限"再做点什么"
 *   2. 停 = 模型没再调工具 **且** 验收谓词（goalMet）通过；否则追问（有上限）
 *   3. 任何工具失败必须回错误文本，不静默；失败达到上限就停并交代卡在哪
 *
 * 工具执行结果统一三种：BLOCKED / SUCCEEDED / FAILED —— 失败编码成工具结果，不破环。
 */

import { compressContext, estimateTokens } from '../context/pipeline.mjs'
import { swapLargeOutput } from '../tools/artifact.mjs'

/**
 * @typedef {Object} LoopInput
 * @property {string} goal
 * @property {Array<{role: string, content: string}>} messages
 * @property {(ctx: any) => Promise<{toolCalls?: Array<{name: string, args: Record<string, any>}>, text?: string}>} model
 * @property {(name: string, args: Record<string, any>) => Promise<any>} execute
 * @property {(tool: string, args: Record<string, any>) => {level: string, rule_id: string, reason: string, granted?: boolean}} authorize
 * @property {(results: any[]) => boolean} [goalMet]
 * @property {number} [maxRounds]
 * @property {number} [maxRetries]
 * @property {(payload: unknown) => void} [onEvent]
 */

/**
 * @typedef {Object} LoopResult
 * @property {'completed'|'maxed_out'|'blocked'} status
 * @property {number} rounds
 * @property {string} [answer]
 * @property {string} [blocker]
 * @property {Array<any>} trace
 */

/**
 * @param {LoopInput} input
 * @returns {Promise<LoopResult>}
 */
export async function runLoop({
  goal,
  messages,
  model,
  execute,
  authorize,
  goalMet,
  maxRounds = 12,
  maxRetries = 2,
  onEvent,
}) {
  const trace = []
  let history = [...messages]
  let consecutiveFailed = 0

  const emit = (payload) => { if (onEvent) onEvent(payload) }

  for (let round = 1; round <= maxRounds; round++) {
    // ① 压缩：发请求前必须过预算
    const before = estimateTokens(history)
    const report = await compressContext(history, {
      summarizer: async (msgs) => `（离线兜底摘要）共 ${msgs.length} 条消息；目标：${goal}；工具轨迹摘要已省略，原文可从 artifact 取回。`,
    })
    history = report.messages

    emit({ type: 'round_start', round, tokensBefore: before, tokensAfter: estimateTokens(history), compress: report.applied })

    const res = await model({ messages: history, goal, round })
    const calls = res.toolCalls ?? []
    if (res.text) history.push({ role: 'assistant', content: res.text })

    if (calls.length === 0) {
      // 停的条件：没工具调用 且（无 goalMet 要求 或 已满足）
      const met = goalMet ? goalMet(trace) : true
      if (met) {
        emit({ type: 'stop', round, reason: '无工具调用且目标满足' })
        return { status: 'completed', rounds: round, answer: res.text ?? '', trace }
      }
      if (round >= maxRounds) {
        return { status: 'maxed_out', rounds: round, blocker: `到 ${maxRounds} 轮仍不满足验收谓词`, trace }
      }
      history.push({
        role: 'user',
        content: `还没通过验收谓词（目标：${goal}）。请继续，或明确说明你认为已经完成并给出依据。`,
      })
      continue
    }

    // 执行每个调用：④ policy → SUCCEEDED / BLOCKED / FAILED
    const results = []
    for (const call of calls) {
      const t0 = Date.now()
      const verdict = authorize(call.name, call.args)
      if (verdict.level === 'deny' || verdict.granted === false) {
        const row = { tool: call.name, status: 'BLOCKED', rule_id: verdict.rule_id, reason: verdict.reason, durMs: Date.now() - t0 }
        results.push(row)
        trace.push(row)
        history.push({ role: 'tool', content: `BLOCKED (${verdict.rule_id}): ${verdict.reason}`, source: call.name })
        continue
      }
      try {
        const raw = await execute(call.name, call.args)
        const { content, ref } = swapLargeOutput('.artifacts', call.name, typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2))
        const row = { tool: call.name, status: 'SUCCEEDED', artifact: ref?.path, durMs: Date.now() - t0 }
        results.push(row)
        trace.push(row)
        history.push({ role: 'tool', content, source: call.name })
        consecutiveFailed = 0
      } catch (err) {
        consecutiveFailed++
        const row = { tool: call.name, status: 'FAILED', error: String(err?.message ?? err), durMs: Date.now() - t0 }
        results.push(row)
        trace.push(row)
        history.push({ role: 'tool', content: `FAILED: ${row.error}`, source: call.name })
      }
    }

    const blockedAll = results.every((r) => r.status === 'BLOCKED')
    if (blockedAll) {
      return { status: 'blocked', rounds: round, blocker: `第 ${round} 轮全部被门拦下：${results.map((r) => r.rule_id).join(', ')}`, trace }
    }
    if (consecutiveFailed >= maxRetries) {
      return {
        status: 'blocked',
        rounds: round,
        blocker: `连续 ${consecutiveFailed} 次工具失败（上限 ${maxRetries}）：${trace[trace.length - 1]?.error ?? '未知'}`,
        trace,
      }
    }
  }

  return { status: 'maxed_out', rounds: maxRounds, blocker: `到达轮次上限 ${maxRounds}，未能确认目标满足`, trace }
}
