/**
 * ⑤ 观测层 —— 执行账（真执行/真产物/真时间）与效果账（改动 ↔ 读数）。
 *
 * 执行账：每次工具调用真实发生过什么、耗时多少、产物在哪。
 * 效果账：每一次声称的改动，都要有改前/改后的可对照读数。
 * 跑过证据：writeLedger() 落盘的 JSON —— 这是「跑过」的唯一凭据。
 */

import { createHash } from 'node:crypto'

/**
 * @typedef {Object} ExecRecord
 * @property {number} t
 * @property {number} round
 * @property {string} tool
 * @property {string} args_hash
 * @property {boolean} ok
 * @property {number} durMs
 * @property {string} [artifact]
 * @property {string} [error]
 * @property {string} [decision]  ④ policy 的决策（rule_id）
 */

/**
 * @typedef {Object} EffectRecord
 * @property {number} t
 * @property {string} target
 * @property {string} [before_hash]
 * @property {string} [after_hash]
 * @property {string} note
 */

export class Ledger {
  constructor({ runId = `run-${Date.now().toString(36)}` } = {}) {
    this.runId = runId
    /** @type {ExecRecord[]} */
    this.exec = []
    /** @type {EffectRecord[]} */
    this.effect = []
    this.startedAt = Date.now()
  }

  /**
   * 记一次真实执行。
   * @param {Omit<ExecRecord, 't'|'args_hash'> & {args?: unknown}} rec
   */
  recordExec({ args, ...rest }) {
    const args_hash = createHash('sha256').update(JSON.stringify(args ?? null)).digest('hex').slice(0, 12)
    const row = { t: Date.now(), args_hash, ...rest }
    this.exec.push(row)
    return row
  }

  /** 记一次效果：改动前后的哈希对照 */
  recordEffect(target, before_hash, after_hash, note = '') {
    const row = { t: Date.now(), target, before_hash, after_hash, note }
    this.effect.push(row)
    return row
  }

  /** 汇总读数 —— 展示给人和给下一窗看的 */
  stats() {
    const ok = this.exec.filter((e) => e.ok).length
    const fail = this.exec.length - ok
    const totalMs = this.exec.reduce((n, e) => n + (e.durMs ?? 0), 0)
    return {
      runId: this.runId,
      轮次衔接: `${new Date(this.startedAt).toISOString()} → ${new Date().toISOString()}`,
      执行: { 总: this.exec.length, 成功: ok, 失败: fail, 合计耗时ms: totalMs },
      效果: this.effect.length,
      有变更: this.effect.filter((e) => e.before_hash !== e.after_hash).length,
    }
  }

  toJSON() {
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      stats: this.stats(),
      exec: this.exec,
      effect: this.effect,
    }
  }
}
