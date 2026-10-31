import test from 'node:test'
import assert from 'node:assert/strict'
import { Policy, defaultRules } from '../src/policy/gate.mjs'

const mkPolicy = () => new Policy(defaultRules())

test('④ 读操作：ALLOW 且带 rule_id + reason', () => {
  const d = mkPolicy().decide('read', { path: 'a.txt' })
  assert.equal(d.level, 'allow')
  assert.ok(d.rule_id && d.reason)
})

test('④ 写操作：ASK（走审批，不是直接放行）', () => {
  const d = mkPolicy().decide('write', { path: 'a.txt' })
  assert.equal(d.level, 'ask')
  assert.equal(d.rule_id, 'R-WRITE-ASK')
})

test('④ 危险操作：DENY，且审批覆盖不了', async () => {
  const p = mkPolicy()
  const d = p.decide('bash', { command: 'rm -rf /' })
  assert.equal(d.level, 'deny')
  const r = await p.resolvePermission('bash', { command: 'rm -rf /' }, async () => true)
  assert.equal(r.granted, false, 'DENY 不可被审批覆盖')
  assert.equal(r.rule_id, 'R-DANGER-DENY')
})

test('④ 默认拒绝：没配规则的工具 ⇒ DENY（暴露缺口，不是放行）', () => {
  const d = mkPolicy().decide('某个从没见过的工具', {})
  assert.equal(d.level, 'deny')
  assert.equal(d.rule_id, 'R-DEFAULT-DENY')
  assert.ok(d.reason.includes('默认拒绝'))
})

test('④ ASK 可被批准 → granted=true', async () => {
  const r = await mkPolicy().resolvePermission('write', { path: 'x.md' }, async (d) => {
    assert.equal(d.level, 'ask')
    return true
  })
  assert.equal(r.granted, true)
})

test('④ ASK 被拒 → granted=false（不是报错）', async () => {
  const r = await mkPolicy().resolvePermission('write', { path: 'x.md' }, async () => false)
  assert.equal(r.granted, false)
})

test('④ 高优先级规则压过普通规则', () => {
  const p = new Policy([
    { id: 'loose', title: '放行一切', match: () => true, level: 'allow', reason: '宽', priority: 1 },
    { id: 'strict', title: '拦一切写', match: (t) => t === 'write', level: 'deny', reason: '严', priority: 50 },
  ])
  assert.equal(p.decide('write', {}).rule_id, 'strict')
  assert.equal(p.decide('read', {}).rule_id, 'loose')
})
