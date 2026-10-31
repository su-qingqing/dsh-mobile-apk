import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolRegistry } from '../src/tools/derive.mjs'
import { swapLargeOutput, readArtifact } from '../src/tools/artifact.mjs'
import { Ledger } from '../src/observe/ledger.mjs'
import { AuditChain } from '../src/observe/audit.mjs'

test('③ 目录只给 name + oneLiner，不含完整 schema', () => {
  const r = new ToolRegistry([
    { name: 'read', oneLiner: '读文件', phases: ['read'], schema: { big: true }, handler: () => 'x' },
  ])
  const list = r.list('read')
  assert.equal(list.length, 1)
  assert.deepEqual(Object.keys(list[0]).sort(), ['name', 'oneLiner'])
  assert.equal(list[0].schema, undefined, '目录阶段不许把 schema 灌进来')
})

test('③ 阶段过滤：write 阶段看不见只属于 read 的工具', () => {
  const r = new ToolRegistry([
    { name: 'read', oneLiner: '读', phases: ['read'], handler: () => 'x' },
    { name: 'write', oneLiner: '写', phases: ['write'], handler: () => 'x' },
  ])
  assert.deepEqual(r.stageNames('read'), ['read'])
  assert.deepEqual(r.stageNames('write'), ['write'])
})

test('③ describe 才给 schema（用到再展开）', () => {
  const r = new ToolRegistry([{ name: 'read', oneLiner: '读', phases: ['read'], schema: { path: 'string' }, handler: () => 'x' }])
  assert.deepEqual(r.describe('read').schema, { path: 'string' })
  assert.equal(r.describe('不存在的工具'), null)
})

test('③ 重复注册直接报错（不许静默覆盖）', () => {
  const r = new ToolRegistry([{ name: 'a', oneLiner: 'a', phases: ['read'], handler: () => 1 }])
  assert.throws(() => r.register({ name: 'a', oneLiner: 'a', phases: ['read'], handler: () => 2 }), /重复注册/)
})

test('s13 小输出不外置', () => {
  const dir = mkdtempSync(join(tmpdir(), 'art-'))
  const out = swapLargeOutput(dir, 'read', '很短的内容', 8000)
  try {
    assert.equal(out.ref, undefined)
    assert.equal(out.content, '很短的内容')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('s13 大输出 → 落盘 + sha256 + 可取回', () => {
  const dir = mkdtempSync(join(tmpdir(), 'art-'))
  try {
    const body = '真内容'.repeat(5000)
    const out = swapLargeOutput(dir, 'bash/ls-la', body, 1000)
    assert.ok(out.ref, '超大输出必须外置')
    assert.ok(out.content.includes('sha256'))
    assert.ok(out.content.includes('大输出已外置'))
    const back = readArtifact(out.ref.path, out.ref.sha256)
    assert.equal(back, body, '原文可完整取回')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('s13 篡改 ⇒ readArtifact 报错（不静默）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'art-'))
  try {
    const out = swapLargeOutput(dir, 'x', 'y'.repeat(5000), 100)
    readArtifact(out.ref.path, out.ref.sha256)
    assert.throws(() => readArtifact(out.ref.path, '0'.repeat(64)), /校验失败/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('⑤ 执行账：真实记录成功/失败/耗时', () => {
  const l = new Ledger({ runId: 'test-run' })
  l.recordExec({ round: 1, tool: 'read', args: { p: 1 }, ok: true, durMs: 5 })
  l.recordExec({ round: 1, tool: 'bash', args: { c: 'ls' }, ok: false, durMs: 7, error: 'boom' })
  const s = l.stats()
  assert.equal(s.执行.总, 2)
  assert.equal(s.执行.成功, 1)
  assert.equal(s.执行.失败, 1)
  assert.equal(s.执行.合计耗时ms, 12)
})

test('⑤ 效果账：改前改后哈希对照', () => {
  const l = new Ledger()
  l.recordEffect('README.md', 'aaa', 'bbb', '补了验收单')
  assert.equal(l.stats().有变更, 1)
  l.recordEffect('same.txt', 'z', 'z', '没动')
  assert.equal(l.stats().有变更, 1, '没变的不算变更')
})

test('s23 哈希链：追加后 verify 通过', () => {
  const c = new AuditChain()
  c.append({ actor: 'harness', action: 'tool.read', payload: { path: 'a' } })
  c.append({ actor: 'harness', action: 'tool.write', payload: { path: 'b' } })
  const v = c.verify()
  assert.equal(v.ok, true)
  assert.equal(v.entries, 2)
})

test('s23 哈希链：篡改任意一条 ⇒ verify 报出断点序号', () => {
  const c = new AuditChain()
  c.append({ actor: 'h', action: 'a1', payload: 1 })
  c.append({ actor: 'h', action: 'a2', payload: 2 })
  c.entries[0].payload_hash = 'f'.repeat(64)
  const v = c.verify()
  assert.equal(v.ok, false)
  assert.equal(v.brokenAt, 1, '第一个被改的位置要报出来')
  assert.ok(v.reason)
})

test('s23 哈希链：删掉中间一条 ⇒ 链断', () => {
  const c = new AuditChain()
  c.append({ actor: 'h', action: 'a1', payload: 1 })
  c.append({ actor: 'h', action: 'a2', payload: 2 })
  c.append({ actor: 'h', action: 'a3', payload: 3 })
  c.entries.splice(1, 1)
  assert.equal(c.verify().ok, false)
})
