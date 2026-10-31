import test from 'node:test'
import assert from 'node:assert/strict'
import { compressContext, estimateTokens } from '../src/context/pipeline.mjs'
import { DurableContextState } from '../src/context/durable.mjs'

const long = (n) => 'x'.repeat(n)

test('① 未超预算时不改动任何东西', async () => {
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'tool', content: 'ok' }]
  const r = await compressContext(msgs, { tokenBudget: 1000 })
  assert.equal(r.messages.length, 2)
  assert.equal(r.applied.l1, 0)
  assert.equal(r.summarized, false)
})

test('① L1 截断超大工具结果，保留原始长度信息', async () => {
  const msgs = [{ role: 'tool', content: long(50_000), source: 'big.log' }]
  const r = await compressContext(msgs, { tokenBudget: 100, truncateAt: 20_000 })
  assert.equal(r.applied.l1, 1)
  assert.equal(r.messages[0].truncated, true)
  assert.equal(r.messages[0].chars, 50_000, '原始长度必须留存，不许丢')
  assert.ok(r.messages[0].content.includes('已截断'))
})

test('① L2 同一 source 多次读只留最新', async () => {
  const msgs = [
    { role: 'tool', content: 'v1', source: 'a.txt' },
    { role: 'tool', content: 'v2', source: 'a.txt' },
    { role: 'tool', content: 'v3', source: 'b.txt' },
  ]
  const r = await compressContext(msgs, { tokenBudget: 0, truncateAt: 1000, keepTurns: 99 })
  const kept = r.messages.filter((m) => m.source === 'a.txt')
  assert.equal(kept.length, 1)
  assert.equal(kept[0].content, 'v2', '只留最新的那次读')
})

test('① L3 只保留最近 N 轮', async () => {
  const msgs = []
  for (let i = 0; i < 6; i++) msgs.push({ role: 'user', content: `第${i}轮提问` })
  msgs.push({ role: 'tool', content: long(30_000), source: 'big' })
  const r = await compressContext(msgs, { tokenBudget: 100, truncateAt: 20_000, keepTurns: 2 })
  const users = r.messages.filter((m) => m.role === 'user').map((m) => m.content)
  assert.ok(users.length <= 3, `应只剩最近几轮，实际 ${users.length}`)
  assert.ok(users.includes('第5轮提问'), '最近一轮必须保留')
})

test('① 硬上限：多条超长工具结果，L1~L3 降级后仍超 ⇒ 抛错，不发请求', async () => {
  // 每条工具结果都被 L1 压到 ~100 字符；靠条数堆过硬上限，逼出「L1~L4 全降级也不够」的分支
  const msgs = Array.from({ length: 400 }, (_, i) => ({ role: 'tool', content: long(500), source: `f${i}.log` }))
  await assert.rejects(
    () => compressContext(msgs, { tokenBudget: 10, hardCap: 1000, truncateAt: 100, keepTurns: 999 }),
    /硬上限/,
  )
})

test('① L3 对助手主导的历史也生效（没有 user 消息也能切分回合）', async () => {
  // 这是个真 bug 的回归哨：回合边界只认 user 时，下面这段会被当成 1 个回合，L3 永不触发
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: 'assistant', content: `第${i}步 ` + long(3_000) }))
  const r = await compressContext(msgs, { tokenBudget: 100, hardCap: 5_000_000, truncateAt: 30_000, keepTurns: 2 })
  assert.ok(r.applied.l3 > 0, 'L3 必须真的砍掉老回合')
  assert.ok(r.messages.length < 10)
  assert.ok(r.messages[r.messages.length - 1].content.includes('第9步'), '最近一步必须留下')
})

test('① 摘要器抛错 ⇒ 保留原历史、标记 summarizerFailed（不许静默丢）', async () => {
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `说话 ${i} ` + long(2_000) }))
  const r = await compressContext(msgs, {
    tokenBudget: 10,
    hardCap: 5_000_000,
    truncateAt: 500,
    keepTurns: 5,
    summarizer: () => { throw new Error('摘要服务挂了') },
  })
  assert.equal(r.summarizerFailed, true)
  assert.equal(r.summarized, false)
  assert.ok(r.messages.length > 0, '历史没有被清空')
})

test('① estimateTokens 是有限数字', () => {
  const n = estimateTokens([{ role: 'user', content: long(10_000) }])
  assert.ok(Number.isFinite(n) && n > 0)
})

test('s14 旁路：pending 只有 harness 能结案，摘要说完成不算', () => {
  const d = new DurableContextState()
  const p = d.pending('把 README 的空窗验收单写完', 'OUT-20261031-2100.md')
  assert.equal(d.openPending().length, 1)
  assert.equal(d.close(p.id), true)
  assert.equal(d.openPending().length, 0)
})

test('s14 旁路：快照不可变 + 带 source_pointer', () => {
  const d = new DurableContextState()
  d.fact('老板的 reasoningEffort=max 是禁区', 'OUT-20261031-2100.md §边界1')
  const snap = d.snapshot()
  snap[0].content = '被改了'
  assert.equal(d.snapshot()[0].content, '老板的 reasoningEffort=max 是禁区', '外部改快照不影响内部')
  assert.ok(d.snapshot()[0].source_pointer.includes('边界'))
  assert.ok(d.toSystemBlock().includes('无损旁路'))
})
