/**
 * ③ 工具面派生 —— s03：先列目录，用到再展开。
 *
 * 不要 60+ 工具全常驻。每个阶段只把该阶段需要的工具放进"可见目录"，
 * 模型先用 `describe` 拿某个工具的 schema，再调用它 ⇒ 上下文里只装"当前面"。
 */

/**
 * @typedef {'discover'|'read'|'write'|'execute'|'finish'} ToolPhase
 *
 * @typedef {Object} ToolSpec
 * @property {string} name
 * @property {string} oneLiner      目录里给模型看的一句话
 * @property {ToolPhase[]} phases   该工具在哪些阶段可见
 * @property {Record<string, unknown>} [schema]  展开才给的 JSON schema
 * @property {(args: Record<string, any>) => Promise<any>|any} handler
 */

export class ToolRegistry {
  /** @param {ToolSpec[]} [specs] */
  constructor(specs = []) {
    /** @type {Map<string, ToolSpec>} */
    this.tools = new Map()
    for (const s of specs) this.register(s)
    /** @type {ToolPhase[]} */
    this.stage = ['discover', 'read', 'write', 'execute', 'finish']
  }

  register(spec) {
    if (this.tools.has(spec.name)) throw new Error(`工具重复注册：${spec.name}`)
    this.tools.set(spec.name, spec)
    return this
  }

  /**
   * 目录：只给名字 + 一句话（不是完整 schema）。s03 的"先列目录"。
   * @param {ToolPhase} phase
   */
  list(phase = 'discover') {
    return [...this.tools.values()]
      .filter((t) => t.phases.includes(phase))
      .map((t) => ({ name: t.name, oneLiner: t.oneLiner }))
  }

  /**
   * 展开：模型说要用了，才给 schema。s03 的"用到再展开"。
   * @param {string} name
   */
  describe(name) {
    const t = this.tools.get(name)
    if (!t) return null
    return { name: t.name, oneLiner: t.oneLiner, schema: t.schema ?? {} }
  }

  /** 取到可执行体（经 ProcessResolver 后仍在同进程安全的工具） */
  get(name) {
    return this.tools.get(name) ?? null
  }

  /** 当前阶段的可见工具名 —— 写进 system 的就是这个，不是全量 */
  stageNames(phase) {
    return this.list(phase).map((t) => t.name)
  }
}
