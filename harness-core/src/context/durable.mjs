/**
 * ① 无损旁路 —— DurableContextState（s14 的旁路部分）。
 *
 * 久性上下文：不能被摘要覆盖／压缩清理。摘要可以说"已完成"，
 * 但 PendingItem 只有 harness 能结案 —— 这是"压完丢东西"的根治点。
 *
 * 三类：
 *   - DurableFact   已确认的事实（带证据指针）
 *   - PendingItem   未决项（只有 harness 能关）
 *   - RetrievalEvidence 取过的证据（原文可读回）
 *
 * 每条必带 source_pointer + last_confirmed_at，且迭代器只产出不可变快照。
 */

/** @typedef {'fact'|'pending'|'evidence'} DurableKind */

/**
 * @typedef {Object} DurableEntry
 * @property {string} id
 * @property {DurableKind} kind
 * @property {string} content
 * @property {string} source_pointer  来源指针：文件路径/命令输出/消息 id
 * @property {number} last_confirmed_at
 * @property {boolean} closed         只有 pending 用得上
 */

let _seq = 0
const nextId = (kind) => `${kind[0]}${Date.now().toString(36)}${(_seq++).toString(36)}`

export class DurableContextState {
  constructor(entries = []) {
    /** @type {DurableEntry[]} */
    this._entries = entries.map((e) => Object.freeze({ ...e }))
  }

  /**
   * @param {DurableKind} kind
   * @param {string} content
   * @param {string} source_pointer
   */
  add(kind, content, source_pointer) {
    const entry = Object.freeze({
      id: nextId(kind),
      kind,
      content,
      source_pointer,
      last_confirmed_at: Date.now(),
      closed: false,
    })
    this._entries.push(entry)
    return entry
  }

  fact(content, source) { return this.add('fact', content, source) }
  pending(content, source) { return this.add('pending', content, source) }
  evidence(content, source) { return this.add('evidence', content, source) }

  /**
   * 结案：只有 harness 能调，摘要不能调。
   * @param {string} id
   * @returns {boolean}
   */
  close(id) {
    const i = this._entries.findIndex((e) => e.id === id)
    if (i < 0) return false
    this._entries[i] = Object.freeze({ ...this._entries[i], closed: true, last_confirmed_at: Date.now() })
    return true
  }

  /** 重确认（事实还在 ⇒ 刷新时间） */
  touch(id) {
    const i = this._entries.findIndex((e) => e.id === id)
    if (i < 0) return false
    this._entries[i] = Object.freeze({ ...this._entries[i], last_confirmed_at: Date.now() })
    return true
  }

  /** 未决项（未结案的）—— 压缩时必定回灌 */
  openPending() { return this._entries.filter((e) => e.kind === 'pending' && !e.closed) }

  /** 全量只读快照 */
  snapshot() { return this._entries.map((e) => ({ ...e })) }

  /**
   * 回灌到 system 的文本形式（给下一位窗口看的第一眼）。
   * @returns {string}
   */
  toSystemBlock() {
    const lines = ['## 无损旁路（不参与有损压缩）']
    const [f, p, e] = ['fact', 'pending', 'evidence'].map((k) => this._entries.filter((x) => x.kind === k && !(k === 'pending' && x.closed)))
    if (f.length) lines.push('已确认事实：', ...f.map((x) => `- ${x.content}  <来源:${x.source_pointer}>`))
    if (p.length) lines.push('未决（只有 harness 能结案）：', ...p.map((x) => `- ${x.content}  <来源:${x.source_pointer}>`))
    if (e.length) lines.push('证据：', ...e.map((x) => `- ${x.content}  <来源:${x.source_pointer}>`))
    return lines.join('\n')
  }
}
