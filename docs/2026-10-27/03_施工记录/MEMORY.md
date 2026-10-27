# 项目长期记忆 · DSH harness v52（桌面3 + 平板）

> 项目根目录：`C:\Users\Administrator\Desktop\3`
> 平板工作区：`/storage/emulated/0/3`（设备 vivo Pad3 Pro，ADB USB 连接）

## 一、不可违反的硬约束（越界整包退回）

| # | 约束 | 出处 |
|---|---|---|
| 1 | `reasoningEffort: max` 一个字不许动。真机现役 `cordis.patch.yml:109` 有这行，仓库权威版（8,603 B）**没有** | 30 条边界 1 |
| 2 | 出厂 `agent-presets` 一个字节不许动；改动一律落 `$DSH_HOME/profiles/web/cordis.patch.yml` | 30 条边界 2 |
| 3 | 不许把过程数据倒到平板（tarball / node_modules / 截图 / 日志）。**已裁定**：探测脚本写 `$B/tmp/` 允许，用完即删 | 30 条边界 3 |

## 二、老板已裁决（2026-10-27）

| # | 事项 | 裁决 |
|---|---|---|
| 1 | 已完成成果（pins 833→569 / 压缩卡五格 / 便签 9 条降级） | **全带**进 v52，不许以"重做更干净"为由丢弃 |
| 2 | 探测脚本能否写平板私有目录 | **允许，用完即删**，执行后 diff 证明回归原状 |
| 3 | 签收门（`工具/交接/签收.mjs`） | **只换写入底座**（.md→SQLite），**读卡＋复述＋雷号三步一个字不动** |
| 4 | 三套"在办"口径 | **三条并行线，一条都不裁**（详见下节） |

## 三、⚠ 三套「在办」口径不是版本递进，是三条并行线

这是本项目最容易踩的认知坑。它们不是历史演进关系，**是三个不同消费者的并行出口**：

| 口径 | 读者 | 谁写 |
|---|---|---|
| `台账/在办.md` | 给**人（她自己）**看 | 手写（台账侧） |
| `状态行.json` | **记录**（机器台账） | `工具/开工/{必读卡,状态核,压缩卡,状态写,入场}.mjs` + `工具/自我/同步.mjs` |
| `交接单_*.md` | 给**下一个窗口**看 | 手写 + `工具/交接/出卡.mjs`（打烊侧） |

落地方式：`doing` 表做唯一可写真源，三份自动渲染各喂各的对象（同 `02:195`，但**不许理解成裁两份**）。
三条线紧迫度不同：`交接单` 那条直接扛 D1「事的连续」，最该先打通。

**教训（可复用）**：看到"多份并存"不要默认是该合并的历史版本——**先问是不是不同消费者**。
判断依据不是 mtime，是**谁在读、在读什么**。我曾用 mtime（10-20/10-25/10-26）误判成递进，被老板纠正。

## 四、操作方法

### 平板文件读取（必用此姿势）
```bash
cd "C:/Users/Administrator/Desktop/3/tools/platform-tools"
./adb.exe exec-out "cat '/storage/emulated/0/3/<路径>.md'"
```
**`adb pull` 遇中文路径必炸（Illegal byte sequence），一律禁止。**

### 需求两份源对照
- 老板令原文：平板 `/storage/emulated/0/3/成果/造壳/30条全发_给电脑侧_1025.md`（**30 条全部要做，不是选做**）
- 电脑侧方案：`plan/experts/01~06` + `plan/下一版本方案.md`
- ⚠ 六份专家方案做调研时**没读过**那份 30 条（grep 零引用），所以存在系统性偏漏。**做核对时必须两源交叉。**

## 五、核心产出文件

- `plan\30条交叉核对.md` —— 30 条逐条判定（覆盖/部分/缺失），带文件:行号
- `plan\v52执行清单_合并版.md` —— 补漏后的 P0–P4
- `plan\待拍板决策单.md` —— 决策流水

## 六、仍待老板给话（7 件，都不卡开工）

| # | 事项 | 我的建议 |
|---|---|---|
| 5 | 记忆库：三份库并行（`.dsh-own` 6.0MB / `.dsh-meow` 6.4MB **今天还在写** / 10-14 旧副本 2.4MB），违反 `cordis.patch.yml:898`「旧的退役、不并行」 | 留 `.dsh-own` 为真源，meow 迁移后退役；**10-14 旧副本保留不动**（回滚点） |
| 6 | 78 台校验器里 **15 台只印字无退出码**（`06:82`），报错也返回 0 | 补退出码。假绿比冒红可怕 |
| 7 | 多模态预算月度上限 | 第一次真掏钱前给个数 |
| 8 | 给人看的 `台账/在办.md` 要不要留"手写→回灌 doing 表"的口子 | 留。否则她绕开写就又分叉 |
| 9 | `@dsh-user` 19 个插件装回带几个（只有 9 个实装，另 10 个是幽灵） | 19 个全还原、disabled 状态照搬。只带 9 个＝不可逆删 10 个 |
| 10 | Python 环境（numpy→handoverai）：py3.14 无 wheel，30 条"另外4件"里唯一没动的 | 装法随老板；验收口径写死：`import numpy` 不报错 |
| 11 | 编程能力冒烟口径有洞：`01:340` D5 只验 node，不验 python/clang/LD_LIBRARY_PATH | 冒烟补 4 条，防假绿 |

## 六之二、⚠ 工作铁律（老板 2026-10-27 15:05 当面训的）

> **「USB 连着、数据在平板，你为什么不去看真实情况？」**
> **「拿着现有的方案去对照真实数据看看，是否有改进和帮助，很难吗？」**

1. **方案/文档里的事实，问老板之前必须先拿真机核一遍。** 本轮核出 3 条事实错（`CONTEXT.md:29` site-packages、`CONTEXT.md:27` apt 可用、`03:33` 三份 memory.db），其中一条我拿它问了老板整整一轮。
2. **能自己查清的不要问。** 老板要的是「可落地的方案」，不是选项清单。可逆的决定（如"19 个插件全带"）自己拍，标注"你觉得不对就推翻"。
3. **不是推翻已有成果，是拿它去对真实数据。** 六份专家方案 + 交叉核对表都有效，本轮只修事实错误、不改框架。

### 真机探测速查（本轮验证可用）
```bash
cd "C:/Users/Administrator/Desktop/3/tools/platform-tools"
./adb.exe exec-out "run-as com.dsharnessmobile.shell sh -c 'F=/data/data/com.dsharnessmobile.shell/files; export LD_LIBRARY_PATH=\$F/usr/lib; ...'"
```
- 壳内 **apt 不可用**（硬编码 Termux 前缀）；**node 能联网**，python 走 SSL 会证书失败
- 探测脚本只能写 `$B/tmp/`，**用完即删**（裁2）

## 七、我问错过、被纠正的地方（别再犯）

1. **拿 mtime 判版本递进** → 实为三条并行线。判"多份并存"必须问**谁在读**，不能看时间戳。
2. **把 06 号的门治理问成"要不要削减"** → `06:71` 原话是"**不建议退……不删任何东西**"，只改注释里的叫法（18 道 accept → 口子；78 台 → 校验器）。**没有"削减"这道题**，真要拍的是那 15 台无退出码的校验器。
3. **把记忆库问成"1115 件这轮做不做"** → 真问题是**三份库今天在并行**，是既成事实的违规，不是排期。
4. **执行顺序陷阱**：3-4 的 E1「停用」必须先做 06 挪格、再对剩下 8 道真门核对；顺序反了会误停。

## 八、坑

- 往 `Desktop\3` **新建目录**会触发沙箱拒绝；写已有目录下的文件可以。

## 九、v52 构建配方（2026-10-27 实测，防内存溢出）

**事故**：照搬仓库 `-Xmx4g` + `parallel=true` + 未关 Kotlin 独立 daemon + 失败后连重启 4 次 ⇒ 31G 机器 native OOM，Git Bash fork 都失败（`0xC0000142`）。判据：Windows `Memory Compression` 占 9GB 时禁起 4G 堆 JVM。

**可用配方**（已验证 BUILD SUCCESSFUL，峰值后 free 7.6GB）：
```
--no-daemon --max-workers=2 -Dorg.gradle.parallel=false
"-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8"
-Pkotlin.compiler.execution.strategy=in-process
```
- `kotlin.compiler.execution.strategy=in-process` 是最关键一刀：干掉独立 Kotlin daemon JVM（约 1.7G，且不随 `--no-daemon` 退出）
- **禁止**在构建进行中 `gradlew --stop`；失败先读 `hs_err_pid*.log` 再动，不许连续重启
- `.bat` 必须 ASCII + CRLF（Write 工具只出 LF，用 `sed -i 's/$/\r/'` 转）；中文注释在 GBK 代码页下会把 `-D...parallel=false` 解析成 `'rallel'`

**验真口径（RC=0 不算证据）**：必须有 `> Task` 行 + `BUILD SUCCESSFUL`；APK 时间戳必须晚于本次启动。

## 十、下载校验规矩（老板问「走 ghproxy 会不会安全点」）

代理只管快慢，真伪必须独立链路兜底：下载走 `ghfast.top`，**校验值取 `api.github.com` release assets 的 `digest` 字段**（GitHub 自算，不经过代理）。不符就整包重下。实测 snapshot-arm64 `139f048a…ad843a` 两边一致；纯直连 1.5MB/min 更不稳。

## 十一、边界1 已用代码复核：`reasoningEffort: max` 不会被抹

- `SnapshotTransaction.kt:615` — patch **按 id 合并，live 内容为基，只追加 live 缺失的工厂块**
- `FactoryProfilePatch.kt:35` — 工厂权威**仅限 `disabled` 键**，「条目内其它用户内容不动」
- `SnapshotTransaction.kt:45` — 升级唯一主动摘除的是 `dsh-model-sync`；她 patch 里只在注释出现 + `node_modules/@aiwayds` 不存在 ⇒ 空操作

## 十二、v52 APK 现状（待装机）

`pull/shell/x/dsh-mobile-apk-v52/app/build/outputs/apk/debug/app-debug.apk`，161,887,582 B，versionCode=52 / versionName=0.14.8，签名证书 SHA-256 `1dde9d98…45bcbd`（repo 固定 debug keystore，可 `install -r`）。assets 内 snapshot.tar.xz 156,777,280 B + sha256 在位。
**卡点**：设备 USB 物理断开（`adb devices` 空）。
