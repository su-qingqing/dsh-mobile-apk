import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLoop } from '../src/loop/runner.mjs'
import { Policy, defaultRules } from '../src/policy/gate.mjs'

const policy = () => new Policy(defaultRules())

/** 造一个「先干一件事，再停」的模型 */
const oneShotModel = (toolCall) => async ({ round }) => {
  if (round === 1) return { toolCalls: [toolCall] }
  return { text: `做完了：${toolCall.name}` }
}

const authorize = (p) => (tool, args) => {
  const d = p.decide(tool, args)
  if (d.level === 'deny') return { ...d, granted: false }
  if (d.level === 'allow') return { ...d, granted: true }
  return { ...d, granted: true } // 测试里 ASK 一律批准
}

test('② 目标满足就停：第 2 轮无工具调用 ⇒ completed', async () => {
  const r = await runLoop({
    goal: '读一个文件',
    messages: [{ role: 'user', content: '读 a.txt' }],
    model: oneShotModel({ name: 'read', args: { path: 'a.txt' } }),
    execute: async () => '文件内容 hello',
    authorize: authorize(policy()),
  })
  assert.equal(r.status, 'completed')
  assert.equal(r.rounds, 2)
  assert.ok(r.answer.includes('read'))
  assert.equal(r.trace.filter((t) => t.status === 'SUCCEEDED').length, 1)
})

test('② 有界：模型一直调工具 ⇒ 到上限就 maxed_out，不无限跑', async () => {
  const r = await runLoop({
    goal: '永远做不完',
    messages: [],
    model: async () => ({ toolCalls: [{ name: 'read', args: { path: 'loop.txt' } }] }),
    execute: async () => 'again',
    authorize: authorize(policy()),
    maxRounds: 3,
  })
  assert.equal(r.status, 'maxed_out')
  assert.equal(r.rounds, 3)
  assert.ok(r.blocker.includes('上限'))
})

test('② 被门全部拦下 ⇒ blocked，并把 rule_id 交出来（不静默）', async () => {
  const strict = new Policy([{ id: 'NO-DANGER', title: '拦', match: () => true, level: 'deny', reason: '本轮一切免谈' }])
  const r = await runLoop({
    goal: '删库',
    messages: [],
    model: async () => ({ toolCalls: [{ name: 'bash', args: { command: 'rm -rf /' } }] }),
    execute: async () => 'never',
    authorize: (t, a) => { const d = strict.decide(t, a); return { ...d, granted: false } },
  })
  assert.equal(r.status, 'blocked')
  assert.ok(r.blocker.includes('NO-DANGER'))
})

// 注意：默认规则里没有 bash ⇒ 走 R-DEFAULT-DENY（这正是"默认拒绝"要的效果）。
// 想测「失败路径」就得显式给 bash 补一条 allow 规则，这是刻意的显式授权，不是绕过门。
const allowBash = () => new Policy([
  ...defaultRules(),
  { id: 'R-BASH-ALLOW', title: '测试用：允许 bash', match: (t) => t === 'bash', level: 'allow', reason: '单测显式授权', priority: 20 },
])

test('② 工具失败 ⇒ 错误文本进历史（不吞错），连续失败到上限就停', async () => {
  const seen = []
  const r = await runLoop({
    goal: '跑一个必然失败的命令',
    messages: [],
    model: async () => ({ toolCalls: [{ name: 'bash', args: { command: 'false' } }] }),
    execute: async () => { throw new Error('exit code 1') },
    authorize: authorize(allowBash()),
    maxRetries: 1,
    onEvent: (e) => seen.push(e),
  })
  assert.equal(r.status, 'blocked')
  assert.ok(r.blocker.includes('失败'))
  assert.ok(r.trace.some((t) => t.status === 'FAILED'), '失败要留痕')
  assert.ok(r.trace.some((t) => t.error?.includes('exit code 1')), '错误原文不许被吞')
})

test('② 没配规则的工具 ⇒ 默认拒绝，不做静默放行（loop 内实证）', async () => {
  const r = await runLoop({
    goal: '调一个没见过的工具',
    messages: [],
    model: async () => ({ toolCalls: [{ name: '从没注册过的工具', args: {} }] }),
    execute: async () => '不该执行到这里',
    authorize: authorize(policy()),
  })
  assert.equal(r.status, 'blocked')
  assert.ok(r.blocker.includes('R-DEFAULT-DENY'))
  assert.ok(r.trace.every((t) => t.status === 'BLOCKED'))
})

test('② 验收谓词不满足 ⇒ 追问而不是假装完成', async () => {
  let calls = 0
  const r = await runLoop({
    goal: '必须产出 evidence.json',
    messages: [],
    model: async () => { calls++; return { text: '我觉得完成了' } },
    execute: async () => 'x',
    authorize: authorize(policy()),
    goalMet: () => false,
    maxRounds: 3,
  })
  assert.equal(r.status, 'maxed_out')
  assert.ok(calls >= 3, '每轮都该被追问一次')
})

test('② s13 生效：超大工具结果在 loop 里自动外置', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-evidence-'))
  const cwd = process.cwd()
  process.chdir(dir)
  try {
    const r = await runLoop({
      goal: '产出大结果',
      messages: [],
      model: async ({ round }) => (round === 1 ? { toolCalls: [{ name: 'bash', args: { command: 'dump' } }] } : { text: 'ok' }),
      execute: async () => 'A'.repeat(20_000),
      authorize: authorize(allowBash()),
    })
    assert.equal(r.status, 'completed')
    const artifact = r.trace.find((t) => t.artifact)
    assert.ok(artifact, '应产出 artifact 引用而不是全量塞回上下文')
  } finally {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }
})
