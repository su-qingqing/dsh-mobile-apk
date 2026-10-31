# harness-core · 空窗验收口径的运行层（WorkBuddy-style）

> 老板令（经苏青青转述）：「让他重新构建环境，把好的东西他能够给的给出来，给不了的就算了，
> 然后打包成型的包……最后在手机上面测试，成不成功跟我们这边关系不是很大。」
>
> ⇒ 本目录是**环境层重写**的那一层：**不修改 `@deepseek-ai/dsh` 引擎本体**（闭源成品包，改动随升级作废）。
> 引擎只作为可插拔后端被调用。实现的"做事逻辑"全部在我方能完全控制的代码里。

## 为什么零依赖 ESM（不是 TS、不是 npm 包）

本机到 GitHub 的网络不稳（大传输必断：`early EOF` / `index-pack` 坏包 / `schannel` 掐线，实测 6 种配置全失败），
任何 `npm install` 都可能卡住。所以：**只用 Node 22 自带能力**，
`node --test` 立刻能出「跑过」证据 —— 不靠运气，也不造第二个黑盒。

## 五层与可搬件的对应

| 层 | 文件 | 搬的机制 | 优先级 |
|---|---|---|---|
| ① 上下文管道 | `context/pipeline.mjs` | s14 四层压缩（截断➜去重➜保留最近➜摘要） | P0 |
| ① 无损旁路 | `context/durable.mjs` | s14 `DurableContextState`：事实/未决/证据带 `source_pointer`，**不进有损压缩** | P0 |
| ② 终止与纠错 | `loop/runner.mjs` | 目标满足才停（验收谓词）、有界轮次、失败引入限制并有对应任务 | — |
| ③ 工具面派生 | `tools/derive.mjs` | s03 先列目录（`name`+`oneLiner`），`describe()` 才给 schema | P1 |
| ④ 约束挂 loop 内 | `policy/gate.mjs` | s04 `Policy.decide()`→ALLOW/ASK/DENY，每条带 `rule_id`+`reason`，**默认拒绝** | P0 |
| ⑤ 观测层 | `observe/ledger.mjs` | 执行账（真执行/真产物/真时间）+ 效果账（改前↔改后哈希） | — |
| 附 s13 | `tools/artifact.mjs` | 大输出外置成 artifact，上下文只留摘要+路径+sha256 | P1 |
| 附 s23 | `observe/audit.mjs` | SHA256 哈希链，`verify()` 报出断点序号 | P1 |

## 怎么用

```bash
node --test test/context.test.mjs test/policy.test.mjs test/tools.test.mjs test/loop.test.mjs
node scripts/smoke.mjs            # 端到端：空窗跑一个最小任务 → .artifacts/evidence.json
```

## 空窗验收 5 条 · 当前读数

| # | 判据 | 状态 | 验法与读数 |
|---|---|---|---|
| 1 | 起得来 | **过** | `node scripts/smoke.mjs` 直接跑完，`loop status=completed` |
| 2 | 看得见状态 | **过** | `onEvent` 每轮输出 `tokensBefore/tokensAfter` + 各压缩层启用条数；`rounds=3` |
| 3 | 做完看见结果 | **过** | 最小任务（写 `smoke.txt` 再读回校验）→ `evidence.json` 带 sha；执行账、效果账、审计链均落盘 |
| 4 | 出错能说清 | **未跑** | 需真机故意失败一次；本机只是"假模型"，这条拒绝占位 ✔ |
| 5 | 下一窗接得住 | **未跑** | 需重启进程证明能从旁路/执行账/审计链恢复；本机未跑 |

**诚实边界**：4、5 两条这里**没有跑过**，不能自称通过。它们依赖一次真实的设备运行（手机或专用测试机）。

## 边界遵守（老板禁区）

- `reasoningEffort: max` —— 本项目不读写它 ✔
- 出厂 `agent-presets` —— 不碰 ✔
- 第三方插件不进 `dsh.profile.bundles` —— 本项目是独立模块，不入 bundles ✔
- 不碰 `profiles/headless-bad/` ✔
- 不回传过程数据到平板 ✔
- 不许静默成功：失败一律抛错/记 `FAILED` 并保留原文 ✔

## 回滚

```bash
git checkout <本 commit 之前的 sha>          # 整包退回
rm -rf harness-core/.artifacts              # 清掉本机跑证据（非交付物）
```
