# 项目长期记忆 · DSH harness v52（桌面3 + 平板）

> 项目根目录：`C:\Users\Administrator\Desktop\3`
> 平板工作区：`/storage/emulated/0/3`（设备 vivo Pad3 Pro，ADB USB 连接）

## 一、不可违反的硬约束（越界整包退回）

| # | 约束 | 出处 |
|---|---|---|
| 1 | `reasoningEffort: max` 一个字不许动。真机现役 `cordis.patch.yml:109` 有这行，仓库权威版**没有**（已核：`grep reasoningEffort` 零命中，`agent-default-model` 只有 provider/model 两键）。权威版实物 = `pull/shell/x/dsh-mobile-apk-v52/scripts/profile-web.cordis.patch.yml`，**17,244 B**；旧记忆里的「8,603 B」对不上，已作废 | 30 条边界 1 |
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
- **探端口别用 `/proc/net/tcp`**（run-as 沙箱 `Permission denied`，会出现假阴性 "none"）。用 `/system/bin/nc -w 3 127.0.0.1 <port>`；3080 正常应答是 `HTTP/1.1 401 Unauthorized`。
- `linker64 $U/bin/node` **必须带 `export LD_LIBRARY_PATH=$U/lib`**，否则 `libz.so.1 not found`。PTC 子进程自己会注入（查其 `/proc/<pid>/environ` 可证），手动验链路时别误判成回归。
- 设备 `curl` 缺库不可用，联网探测改用 `$U/bin/node` 的 `fetch`。
- 解包 deb 必须 `export PATH=$U/bin:/system/bin`，否则 `dpkg-deb` 调到 toybox tar，报 `Unknown option 'warning=no-timestamp'`。

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

**假绿的两种成因（2026-10-27 均实测命中）**：
1. **JVM 根本没起来**：`os::commit_memory failed … 页面文件太小 (DOS error 1455)` / `G1 virtual space` mmap 失败。**物理内存不是瓶颈，提交量（commit）才是** —— 当时物理空闲 5.5G，但提交限制 47.1G 已用 46.8G，只剩 0.27G。元凶 `firefox` 单进程私有提交 **19.1G**（工作集 1.6G，泄漏 9h46m）。判据命令：`Get-CimInstance Win32_OperatingSystem` 的 `FreeVirtualMemory` + `Win32_PageFileSetting`（本机 pagefile **固定 16,384 MB**，不自动增长）。
2. **cmd 丢返回值**：`call gradlew.bat …` 失败后 `%errorlevel%` 仍为 0。**修法**：判据改成 `findstr /C:"BUILD SUCCESSFUL" build.log`，输出 `VERDICT=SUCCESS/FAILED`；`run-build.bat` 外层**不能**再 `> build.log`（会把内部日志覆盖成空）。
- 现役脚本：`build-real.sh`（bash，日志 `build-real-1027.log`）、`build-v52.bat`（已改单行参数 + findstr 判据，CRLF 32 行）。

## 十、下载校验规矩（老板问「走 ghproxy 会不会安全点」）

代理只管快慢，真伪必须独立链路兜底：下载走 `ghfast.top`，**校验值取 `api.github.com` release assets 的 `digest` 字段**（GitHub 自算，不经过代理）。不符就整包重下。实测 snapshot-arm64 `139f048a…ad843a` 两边一致；纯直连 1.5MB/min 更不稳。

## 十一、边界1 已用代码复核：`reasoningEffort: max` 不会被抹

- `SnapshotTransaction.kt:615` — patch **按 id 合并，live 内容为基，只追加 live 缺失的工厂块**
- `FactoryProfilePatch.kt:35` — 工厂权威**仅限 `disabled` 键**，「条目内其它用户内容不动」
- `SnapshotTransaction.kt:45` — 升级唯一主动摘除的是 `dsh-model-sync`；她 patch 里只在注释出现 + `node_modules/@aiwayds` 不存在 ⇒ 空操作

## 十二、v52 APK 现状（**17:24 已换装新编译包**）

**设备在跑的那份**（`/data/app/.../base.apk`）：161,891,720 B，sha256 `6fdc9fc879047aae35d2b7f2ac170873b5435396fd37ec9a5516d5bfc8079f0b`，`versionCode=52` / `versionName=0.14.8` / `lastUpdateTime=2026-10-27 17:24:07`。即 17:20 `--rerun-tasks` 全量重编译产物，装机后冷启动验证通过（patch 未动、引擎起、UI 实跑）。

**回滚副本**：`backup/app-debug-1027-1633-installed.apk.bak`（旧版 `f2424eed05bf178c…bea6e0`，161,902,342 B）。

**「编译成功」判据（硬口径）**：`BUILD SUCCESSFUL` + 非 UP-TO-DATE 任务里必须含 `compileDebugKotlin`/`dexBuilderDebug`/`packageDebug`。全 `up-to-date` 只证明缓存可用，**不能**当编译证据。
`touch` 源文件**无效**（Gradle 按内容哈希），要真编译只能改内容或 `--rerun-tasks`。

产物自检脚本：`plan/verify-apk.py`（zip 全量 CRC + snapshot sha 双向 + 签名 + 必备项，exit 0 才算过）；新旧对比：`plan/compare-apk.py`（条目级 sha + VERDICT 输出）。

## 十三、v0.14.8 破坏性变更：prompt 变量严格校验（2026-10-27 踩过，会复发）

| 事实 | 位置 |
|---|---|
| 只注册 `provider` / `model` 两个 prompt 变量，**`cwd` 已删** | `dsh-agent-loop/lib/index.js:1591-1592` |
| 未注册变量**从静默保留改为抛错** | `dsh-system-prompt/lib/index.js:172-175` |
| 她的 persona 段带 `{{cwd}}`（1011 内联的官方模板） | `profiles/web/cordis.patch.yml`（`preset-suqingqing` → `persona.config.suffix`） |
| 出厂三份 preset 也都带 `{{cwd}}`，**换 preset 即复发**，而出厂目录不许动（边界2） | `$D/config/agent-presets/{standard,code,cordis}/agent.cordis.yml` |

**症状**：她发消息 → UI 报 `[runtime-unavailable]` / 400；`engine.log` **看不到**；连续 `turn_end ok:false`。

**排障唯一正确入口**（`engine.log` 在这里是盲区）：
```bash
$F/usr/bin/zstd -dc $B/sessions/--storage-emulated-0-3--/<session>/session.v4.jsonl.zstd | tail -c 6000
```
`turn/end` 事件带完整 `error.message`。

**改 patch 后必须重启 app**（`am force-stop` + `monkey … LAUNCHER`），热改不生效——否则会看到 400 这种「改了还不对」的假象。

## 十四、当前现役基线（2026-10-27 17:05 定档）

| 项 | 值 |
|---|---|
| 设备 `profiles/web/cordis.patch.yml` sha256 | `116723428feba659629db136aa3cc295e17a3212cc4b072f0ac7b592b0ed2679`（63,290 B，48 个顶层条目） |
| 电脑侧存档 | `Desktop\3\plan\out\live-v52-final-patch.yml`（同名 sha256 文件，**与设备逐字节一致**） |
| 回滚点 | `cordis.patch.yml.bak-1027-前ptc追版`（63,125 B） |
| 边界1 | `:109 reasoningEffort: max` ✓ |
| 边界2 | 出厂 `agent-presets` 零改动 ✓ |

**两条已完成的追版**：
1. `:383` persona `suffix` 去掉 `{{cwd}}`（v0.14.8 严格校验，16:42）
2. `:289-293` `ptc-runtime` 由 `nodeExecutable` 改 `launch: {kind: node-script, executable: $U/libexec/dsh-node}`（ptc-runtime-node 0.2.1-rc.2 已删旧键，`launch` 无 `.default()` ⇒ 不回落）

**D3 回灌定案：只补真缺口，不整文件替换。**
`plan/out/profile-web.cordis.patch.merged.yml` **永久弃用**（会丢 `ins:model-capability`、`reasoningEffort` 打回 `high`）。
逐段审计脚本：`plan/diff-her-patch.mjs`、`plan/diff-auth-vs-live.mjs`、`plan/show-blocks.mjs`；设备端断言 `pull/_probe/verify-d3.mjs`（12 条 ALL_PASS）。

**clang 已修复**（升级前既有残缺）：从 `$U/var/cache/apt/archives` 的 9 个 deb 解包，`clang 21.1.8` 可用，C/C++ 编译运行双通过。未联网、未动 `install-clang.sh`、未碰出厂目录。
