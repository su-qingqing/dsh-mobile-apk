/**
 * ① 上下文管道 —— s14 四层压缩（有损部分）。
 *
 * 软阈值 → 四层逐级降级；硬上限：直接抛错，不发请求（不许静默超预算）。
 * 摘要失败 ⇒ 保留原历史（宁可长，不许丢）。
 *
 * L1 截断大工具结果（> threshold 只留头尾 + 标记）
 * L2 同一文件的多次读，只留最新
 * L3 只保留最近 N 轮
 * L4 更老的做摘要
 */

/**
 * @typedef {Object} Msg
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {string} [source]     L2 去重键（文件路径 / 命令）
 * @property {number} [ts]
 * @property {number} [chars]      L1 原始长度（被截断时保留）
 * @property {boolean} [truncated]
 */

/**
 * @typedef {Object} PipelineOpts
 * @property {number} [tokenBudget]    软阈值（字符数近似）
 * @property {number} [hardCap]        硬上限，超过就抛错
 * @property {number} [truncateAt]     单条工具结果超过多少字符就截断
 * @property {number} [keepTurns]      L3 保留最近几轮
 * @property {(msgs: Msg[]) => Promise<string>|string} [summarizer] L4 摘要器
 */

/**
 * @typedef {Object} CompressReport
 * @property {Msg[]} messages
 * @property {Record<string, number>} applied  每层实际处理条数
 * @property {number} beforeChars
 * @property {number} afterChars
 * @property {boolean} summarized
 * @property {boolean} summarizerFailed
 */

const countChars = (msgs) => msgs.reduce((n, m) => n + (m.content?.length ?? 0), 0)

/** 粗略估算：一条 x 字符的消息约等于 x/3.5 个 token（中文友好） */
export const estimateTokens = (msgs) => Math.ceil(countChars(msgs) / 3.5)

/**
 * L1：截断超长工具结果
 */
export function truncateLarge(msgs, truncateAt) {
  let n = 0
  const out = msgs.map((m) => {
    if (m.role !== 'tool' || (m.content?.length ?? 0) <= truncateAt) return m
    const head = m.content.slice(0, Math.floor(truncateAt * 0.6))
    const tail = m.content.slice(-Math.floor(truncateAt * 0.3))
    n++
    return { ...m, content: `${head}\n\n…[已截断 ${m.content.length} 字符，正文见 artifact/原文]\n\n${tail}`, chars: m.content.length, truncated: true }
  })
  return { messages: out, n }
}

/** L2：同一 source 的多次读取只留最新 */
export function dedupeRepeated(msgs) {
  const lastIndex = new Map()
  msgs.forEach((m, i) => { if (m.role === 'tool' && m.source) lastIndex.set(m.source, i) })
  const drop = new Set()
  for (const [src, keep] of lastIndex) {
    msgs.forEach((m, i) => { if (m.role === 'tool' && m.source === src && i !== keep) drop.add(i) })
  }
  return { messages: msgs.filter((_, i) => !drop.has(i)), n: drop.size }
}

/** L3：只留最近 N 轮（回合边界 = user 或 assistant，两者都能开启一轮） */
export function keepRecentTurns(msgs, keepTurns) {
  const turns = []
  let cur = []
  for (const m of msgs) {
    // 助手主导的历史（没有 user 消息）也得能切分，否则 L3 形同虚设
    if ((m.role === 'user' || m.role === 'assistant') && cur.length) {
      turns.push(cur)
      cur = [m]
    } else {
      cur.push(m)
    }
  }
  if (cur.length) turns.push(cur)
  if (turns.length <= keepTurns) return { messages: msgs, n: 0 }
  const kept = turns.slice(-keepTurns).flat()
  return { messages: kept, n: turns.length - keepTurns }
}

/**
 * 主入口：软阈值触发层层降级，硬上限抛错。
 * @param {Msg[]} messages
 * @param {PipelineOpts} opts
 * @returns {Promise<CompressReport>}
 */
export async function compressContext(messages, opts = {}) {
  const {
    tokenBudget = 24_000,
    hardCap = 60_000,
    truncateAt = 20_000,
    keepTurns = 8,
    summarizer,
  } = opts

  const beforeChars = countChars(messages)
  /** @type {Record<string, number>} */
  const applied = { l1: 0, l2: 0, l3: 0, l4: 0 }
  let msgs = messages
  let summarized = false
  let summarizerFailed = false

  if (estimateTokens(messages) <= tokenBudget) {
    return { messages, applied, beforeChars, afterChars: beforeChars, summarized, summarizerFailed }
  }

  // L1 → L2 → L3：逐级降级，够用就停
  const l1 = truncateLarge(msgs, truncateAt); msgs = l1.messages; applied.l1 = l1.n
  if (estimateTokens(msgs) > tokenBudget) {
    const l2 = dedupeRepeated(msgs); msgs = l2.messages; applied.l2 = l2.n
  }
  if (estimateTokens(msgs) > tokenBudget) {
    const l3 = keepRecentTurns(msgs, keepTurns); msgs = l3.messages; applied.l3 = l3.n
  }

  // L4：摘要（失败就保留原历史，不许静默丢）
  if (estimateTokens(msgs) > tokenBudget && summarizer) {
    try {
      const summary = await summarizer(msgs)
      const systemish = msgs.filter((m) => m.role === 'system')
      const recent = msgs.slice(-Math.min(4, msgs.length))
      msgs = [
        ...systemish,
        { role: 'system', content: `## 前情摘要（由 harness 生成，不代表已结案）\n${summary}` },
        ...recent,
      ]
      applied.l4 = 1
      summarized = true
    } catch {
      summarizerFailed = true
    }
  }

  const after = estimateTokens(msgs)
  if (after > hardCap) {
    throw Object.assign(
      new Error(`上下文超硬上限：估算 ${after} token > ${hardCap}，已触发 L1~L4 全部降级仍不够 ⇒ 不发请求（宁可报错，不许超预算）`),
      { applied, beforeChars, afterChars: countChars(msgs) },
    )
  }

  return { messages: msgs, applied, beforeChars, afterChars: countChars(msgs), summarized, summarizerFailed }
}
