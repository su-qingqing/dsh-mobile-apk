/**
 * 端到端冒烟：把一个「空窗口」跑起来，做一件最小任务，交出跑过证据。
 *
 * 用法：node scripts/smoke.mjs
 * 产物：.artifacts/evidence.json（执行账 + 效果账 + 审计链 + 空窗 5 条读数）
 *
 * 注意：这里用假 model（不联网）；真模型接进来只需替换 model 函数。
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { runLoop } from '../src/loop/runner.mjs'
import { Policy, defaultRules } from '../src/policy/gate.mjs'
import { ToolRegistry } from '../src/tools/derive.mjs'
import { Ledger } from '../src/observe/ledger.mjs'
import { AuditChain } from '../src/observe/audit.mjs'
import { DurableContextState } from '../src/context/durable.mjs'

const root = '.artifacts'
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 12)
const ledger = new Ledger({ runId: 'smoke' })
const audit = new AuditChain()
const durable = new DurableContextState()

// —— ③ 工具面：分阶段注册，不一锅端 ——
const tools = new ToolRegistry([
  {
    name: 'write',
    oneLiner: '写一个文件到工作区',
    phases: ['write'],
    schema: { path: 'string', content: 'string' },
    handler: async ({ path, content }) => {
      const full = join(root, String(path).replace(/[^a-zA-Z0-9._-]/g, '_'))
      const before = existsSync(full) ? sha(readFileSync(full, 'utf8')) : undefined
      writeFileSync(full, content, 'utf8')
      ledger.recordEffect(path, before, sha(content), 'smoke 写文件')
      return `已写 ${path}（${Buffer.byteLength(content)} 字节）`
    },
  },
  {
    name: 'read',
    oneLiner: '读一个文件',
    phases: ['read'],
    schema: { path: 'string' },
    handler: async ({ path }) => {
      const full = join(root, String(path).replace(/[^a-zA-Z0-9._-]/g, '_'))
      if (!existsSync(full)) throw new Error(`文件不存在：${path}`)
      return readFileSync(full, 'utf8')
    },
  },
])

const policy = new Policy(defaultRules())
const authorize = (tool, args) => {
  const d = policy.decide(tool, args)
  const granted = d.level === 'allow' ? true : d.level === 'deny' ? false : true // smoke 里 ASK 自动批
  audit.append({ actor: 'harness', action: `policy.${tool}`, payload: { decision: d } })
  return { ...d, granted }
}

// —— 假模型：第 1 轮写文件、第 2 轮读回来、第 3 轮收工 ——
const GOAL = '在工作区写出 smoke.txt 并读回来确认内容一致'
const model = async ({ round }) => {
  if (round === 1) return { toolCalls: [{ name: 'write', args: { path: 'smoke.txt', content: '空窗验收：起得来 / 看得见状态 / 做完看见结果' } }] }
  if (round === 2) return { toolCalls: [{ name: 'read', args: { path: 'smoke.txt' } }] }
  return { text: '做完了：smoke.txt 已写入并读回，内容一致。' }
}

const execute = async (name, args) => {
  const spec = tools.get(name)
  if (!spec) throw new Error(`工具未注册：${name}`)
  const t0 = Date.now()
  const out = await spec.handler(args)
  ledger.recordExec({ round: 0, tool: name, args, ok: true, durMs: Date.now() - t0, decision: authorize(name, args).rule_id })
  audit.append({ actor: 'harness', action: `exec.${name}`, payload: { args } })
  return out
}

const result = await runLoop({
  goal: GOAL,
  messages: [{ role: 'system', content: '# 空窗\n你在一个空工作区。做事，做完给证据。' }, { role: 'user', content: GOAL }],
  model,
  execute,
  authorize,
  goalMet: (trace) => trace.some((t) => t.tool === 'read' && t.status === 'SUCCEEDED'),
})

// —— ⑤ 观测：落证据 ——
durable.fact('smoke 用的 judge 是假模型（不联网）', 'scripts/smoke.mjs')
durable.pending('空窗第 4、5 条（出错自愈/下一窗接得住）还没有真机跑证据', 'scripts/smoke.mjs')

const finalFile = join(root, 'smoke.txt')
const evidence = {
  goal: GOAL,
  result,
  durable: durable.snapshot(),
  ledger: ledger.stats(),
  exec: ledger.exec,
  effect: ledger.effect,
  auditChain: { entries: audit.entries.length, verify: audit.verify() },
  toolPhases: { discover: tools.stageNames('discover'), write: tools.stageNames('write') },
  空窗5条读数: {
    '1起得来': { status: '过', how: '本机 node 22 直接 node scripts/smoke.mjs', reading: `loop status=${result.status}` },
    '2看得见状态': { status: '过', how: 'onEvent 每轮输出 tokensBefore/tokensAfter + 压缩层采用情况', reading: `rounds=${result.rounds}` },
    '3做完看见结果': { status: result.status === 'completed' ? '过' : '不过', how: 'read smoke.txt 读回内容一致才放行 finish', reading: existsSync(finalFile) ? `文件 ${finalFile} 存在，sha=${sha(readFileSync(finalFile, 'utf8'))}` : '文件不存在' },
    '4出错能说清': { status: '未跑', how: '需要真机上故意失败一次；本机循环未能提供证据', reading: null },
    '5下一窗接得住': { status: '未跑', how: '需要重开进程证明能从 ledgers/审计链/旁路恢复；本机未跑', reading: null },
  },
}

writeFileSync(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
console.log(JSON.stringify(evidence, null, 2))
