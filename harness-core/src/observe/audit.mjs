/**
 * ⑤ 观测层的一半：审计哈希链（s23）。
 *
 * 每条记录 = { seq, ts, actor, action, payload_hash, prev_hash, hash }
 * hash = sha256(prev_hash + canonical(entry)) —— 改动任意一条，后续全断。
 * verify() 从头重算，返回第一个断点的序号。
 */

import { createHash } from 'node:crypto'

const canonical = (obj) => JSON.stringify(obj, Object.keys(obj).sort())

/**
 * @typedef {Object} AuditEntry
 * @property {number} seq
 * @property {number} ts
 * @property {string} actor
 * @property {string} action
 * @property {string} payload_hash
 * @property {string} prev_hash
 * @property {string} hash
 */

export class AuditChain {
  /** @param {AuditEntry[]} [entries] 已有链（用于 verify-from-file） */
  constructor(entries = []) {
    /** @type {AuditEntry[]} */
    this.entries = entries
  }

  static hashPayload(payload) {
    return createHash('sha256').update(canonical(payload ?? null)).digest('hex')
  }

  /**
   * 追加一条。
   * @param {{actor: string, action: string, payload?: unknown}} input
   * @returns {AuditEntry}
   */
  append({ actor, action, payload }) {
    const prev = this.entries.length
      ? this.entries[this.entries.length - 1].hash
      : '0'.repeat(64)
    const seq = this.entries.length + 1
    const entry = {
      seq,
      ts: Date.now(),
      actor,
      action,
      payload_hash: AuditChain.hashPayload(payload),
      prev_hash: prev,
      hash: '',
    }
    entry.hash = createHash('sha256')
      .update(prev + canonical({ seq: entry.seq, ts: entry.ts, actor, action, payload_hash: entry.payload_hash }))
      .digest('hex')
    this.entries.push(entry)
    return entry
  }

  /**
   * 校验整条链。
   * @returns {{ok: boolean, entries: number, brokenAt?: number, reason?: string}}
   */
  verify() {
    let prev = '0'.repeat(64)
    for (const [i, e] of this.entries.entries()) {
      if (e.prev_hash !== prev) {
        return { ok: false, entries: this.entries.length, brokenAt: e.seq, reason: 'prev_hash 对不上（前一条被改过或被删过）' }
      }
      const expect = createHash('sha256')
        .update(prev + canonical({ seq: e.seq, ts: e.ts, actor: e.actor, action: e.action, payload_hash: e.payload_hash }))
        .digest('hex')
      if (e.hash !== expect) {
        return { ok: false, entries: this.entries.length, brokenAt: e.seq, reason: '本条 hash 与内容不符（这一条被篡改）' }
      }
      prev = e.hash
    }
    return { ok: true, entries: this.entries.length }
  }

  toJSON() {
    return this.entries
  }
}
