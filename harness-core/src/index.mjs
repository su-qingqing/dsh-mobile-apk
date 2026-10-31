/**
 * harness-core —— WorkBuddy-style harness runner（空窗验收口径）。
 *
 * 为什么零依赖 ESM：本机网络不稳（GitHub 大传输必断），装依赖靠运气；
 * 用 node 22 自带能力实现 ⇒ `npm test` 立刻出「跑过」证据。
 *
 * 五层（对应老板令 + 可搬件优先级）：
 *   ① 上下文管道   <- s14 四层压缩 + 无损旁路（P0）
 *   ② 终止与纠错   <- 目标满足就停、有界轮次、失败可恢复
 *   ③ 工具面派生   <- s03 先列目录、用到再展开（P1）
 *   ④ 约束挂 loop  <- s04 三阶段 + rule_id + reason + 默认拒绝（P0）
 *   ⑤ 观测层       <- 执行账 / 效果账 / 跑过证据
 *   附：s13 大输出外置（P1）、s23 审计哈希链（P1）
 *
 * 诚实边界：这是「环境层」重写，不改 @deepseek-ai/dsh 引擎本体；
 * 引擎作为可插拔后端被调用，够不到的地方一律如实标注不可用。
 */

export { runLoop } from './loop/runner.mjs'
export { compressContext, estimateTokens } from './context/pipeline.mjs'
export { DurableContextState } from './context/durable.mjs'
export { ToolRegistry } from './tools/derive.mjs'
export { swapLargeOutput, readArtifact } from './tools/artifact.mjs'
export { Policy, defaultRules } from './policy/gate.mjs'
export { Ledger } from './observe/ledger.mjs'
export { AuditChain } from './observe/audit.mjs'
