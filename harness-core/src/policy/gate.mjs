/**
 * ④ 约束挂 loop 内 —— s04：程序形式化成 Policy.decide()。
 *
 * 决策替代智能比位点高。规则返回 ALLOW / ASK / DENY，
 * 每条都带 rule_id + reason，模型可以据此调整参数；
 * 执行结果是 BLOCKED / SUCCEEDED / FAILED，作为工具结果返回（不破环）。
 *
 * 安全姿态（SECURITY-09）：未能准入的操作默认拒绝，而非默认放行。
 * 无规则 ⇒ DENY（暴露缺口，而不是偷偷放行）。
 */

/** @typedef {'allow'|'ask'|'deny'} AllowLevel */

/** @typedef {Object} Decision
 *  @property {AllowLevel} level
 *  @property {string} rule_id
 *  @property {string} reason
 */

/**
 * 规则条目。
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} title
 * @property {(tool: string, args?: Record<string, any>) => boolean} match
 * @property {AllowLevel} level
 * @property {string} reason
 * @property {number} [priority]
 */

export class Policy {
  /** @param {Rule[]} [rules] */
  constructor(rules = []) {
    /** @type {Rule[]} */
    this.rules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  /**
   * 新增规则。
   * @param {Rule} rule
   */
  add(rule) {
    this.rules.push(rule)
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    return this
  }

  /**
   * 决策。匹配的第一个规则胜（纯函数，审批者不得触碰）。
   * @param {string} tool 工具名
   * @param {Record<string, any>} [args]
   * @returns {Decision}
   */
  decide(tool, args = {}) {
    for (const rule of this.rules) {
      if (rule.match(tool, args)) {
        return { level: rule.level, rule_id: rule.id, reason: rule.reason }
      }
    }
    // 默认拒绝：没有规则 = 没有授权
    return {
      level: 'deny',
      rule_id: 'R-DEFAULT-DENY',
      reason: `工具 ${tool} 没有匹配到任何规则 ⇒ 默认拒绝（要用的话先补规则）`,
    }
  }

  /**
   * 三阶段：规则 → 审批（只对 ASK 问人）→ 执行。
   * DENY 不可被审批覆盖 —— 这是硬边界。
   *
   * @param {string} tool
   * @param {Record<string, any>} args
   * @param {(d: Decision) => Promise<boolean>|boolean} approver
   */
  async resolvePermission(tool, args, approver) {
    const decision = this.decide(tool, args)
    if (decision.level === 'deny') return { ...decision, granted: false }
    if (decision.level === 'allow') return { ...decision, granted: true }
    // ask
    const granted = await approver(decision)
    return { ...decision, granted }
  }
}

/** 常用默认规则集：读放行、写询问、危险拒绝。 */
export function defaultRules() {
  return [
    {
      id: 'R-READ-ALLOW',
      title: '只读操作放行',
      match: (tool) => /^(read|list|grep|glob|stat|view)$/.test(tool),
      level: 'allow',
      reason: '只读不改变任何状态，放行',
      priority: 10,
    },
    {
      id: 'R-WRITE-ASK',
      title: '写入需询问',
      match: (tool) => /^(write|edit|patch|replace|move|delete)$/.test(tool),
      level: 'ask',
      reason: '改动落到盘上，先问一句',
      priority: 10,
    },
    {
      id: 'R-DANGER-DENY',
      title: '危险操作拒绝',
      match: (tool, args = {}) => {
        const text = JSON.stringify(args ?? {})
        return /rm\s+-rf\s+\/|--force|chmod\s+777|>\s*\/dev\/sda/.test(text)
      },
      level: 'deny',
      reason: '不可逆/越权操作，不给放行也不给审批入口',
      priority: 100,
    },
  ]
}
