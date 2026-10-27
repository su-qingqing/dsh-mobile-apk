# 共享事实底座（子代理必读，勿重复探测）

> 这是主代理已**确证**的事实。子代理直接采信，不要重新验证；只在需要新事实时才去设备/源码取。
> 所有子代理**只读**，禁止修改平板与本地源码树。

## 1. 设备与访问

- 设备：vivo Pad3 Pro（PA2473），USB 在线，包 `com.dsharnessmobile.shell`
- 现役版本：**versionCode 51 / versionName 0.14.7-rc2main2**（minSdk 26 / targetSdk 34）
- ADB：`C:\Users\Administrator\Desktop\3\tools\platform-tools\adb.exe`（简写 `$A`）
- DEBUGGABLE → `run-as com.dsharnessmobile.shell` 可直接读私有数据（简写 `$R`）
- 私有根：`/data/data/com.dsharnessmobile.shell/files/`（简写 `$F`）
- 她的内核目录：`$F/home/.dsh/`（简写 `$B`）
- 工作区（sdcard）：`/storage/emulated/0/3/`

### 三条硬规矩（踩过的坑）
1. **`adb pull` 遇中文路径必报 `Illegal byte sequence`** → 用 tar 流式：
   `$A exec-out "$R tar -cf - -C <父目录> <名>" > out.tar`
2. **`run-as` 进程读不了 sdcard**（`Permission denied`，Android 11+ 无外存权限）→ 要执行的脚本必须放进私有目录：
   `$A exec-out "$R sh -c 'cat > $B/tmp/x.py'" < 本地脚本.py`
3. **跑 Termux 二进制必须补库路径**，否则报 `library "libz.so.1" not found`：
   `export LD_LIBRARY_PATH=/data/data/com.dsharnessmobile.shell/files/usr/lib`

## 2. 本地编程环境（平板上，完好）

- Termux 用户态 prefix：`$F/usr/`
- ✅ 2026-10-27 真机实测可用：`node v24.18.0`、`Python 3.14.6`、`clang`（含 `aarch64-linux-android-*` 交叉链）
- ❌ **修正（原写"apt 可用"是错的）**：壳内 `apt` **不可用** —— 它硬编码读 `/data/data/com.termux/files/usr/etc/apt/apt.conf.d/`，而壳内 prefix 在 `/data/data/com.dsharnessmobile.shell/files/usr/`，跑 `apt-cache` 直接报 `Unable to determine a suitable packaging system type`。**别指望用 apt/pkg 装任何东西。**
- ❌ **修正（原写"无 site-packages"是错的）**：`$F/usr/lib/python3.14/site-packages` **存在**，pip 26.2.1 就在那儿
- ⚠ **装不了 numpy**：无 `gfortran`（编译路死）；pip 走 PyPI 报 `CERTIFICATE_VERIFY_FAILED`（系统 CA 缺）
- ✅ **但 node 能联网**：npm registry 200、PyPI JSON 通（2026-10-27 实测）⇒ 要用网络的活儿走 node，别走 python
- ⚠ 无 `sqlite3` 命令行 → 用 `python3 -c` 或 node 读库
- 这是"编程能力 + 本地环境"的载体，新版本必须保留且保证可启动
- 🔴 **冒烟判据别只验 node**（`01:340` 现在只验它）→ 至少 4 条：`node -v`／`python3 -V`／`clang --version`／补 `LD_LIBRARY_PATH` 后 node 跑通

## 3. 她的内核资产（v51 侧，`$B`）

- `$B/skills/`：`codingame`、`kickoff`
- `$B/hooks/`：`claude-code`
- `$B/prompts/`：`zh`
- `$B/env/`：`README.md`、`capability-probe.sh`、`new-project.sh`
- `$B/profiles/`：`headless`、`headless-bad`、`node_modules`、`web`
- `$B/state/跨窗/`：**`index.db` — 731,205,632 字节（731MB），最后写 2026-10-26 21:13**
  ← 跨窗交接库已有实物底座，**但 schema 尚未探明**（探测脚本因 sdcard 权限失败，需重做）
- `$B/media/`：jpg + `probe-live.py`（已有图像/取景能力苗头）

## 4. 她的工作平台（`/storage/emulated/0/3/工具/`）

- `内核/`（20 个 .mjs）：`连续性.mjs`、`换窗公式.mjs`、`注入计量.mjs`、`注入面.mjs`、`自举.mjs`、`调度.mjs`、
  `轮末自检.mjs`、`闸门自测.mjs`、`闭环.mjs`、`停手线.mjs`、`动作集.mjs`、`工具面核.mjs`、`五处同改核.mjs`、
  `月亮复活核.mjs`、`钉子户闸.mjs`、`基线.mjs`、`单价.mjs`、`口令.mjs`、`回程.mjs`、`工具用量.mjs`
- `开工/`：`pointer.mjs`、`上一窗目标.mjs`、`入场.mjs`、`全景.mjs`、`开窗.mjs`、`必读卡.mjs`、`库.mjs`、`台面.mjs`、`压缩卡.mjs`
  （`压缩卡.mjs` 有 `bak-1027` → 今天仍在改）
- `台账/`：`账本.mjs`、`令账.mjs`、`经验账本.mjs`、`双证_经验账本.mjs`、`原话索引.mjs`、`成果索引.mjs`、
  `流程定义.mjs`、`分诊.mjs`、`冻结.mjs`、`库总账.mjs`… 含 `轮末/` 子目录
- `接续/`：`令账落地.mjs`、`反事实测.mjs`
- `技能/`：`codingame-troll-farm.md`
- `审判/`：验收、覆盖核、抽查落点、分批、出覆盖表
- `呈现/`：`报表.mjs`；`取证/`：`取证.mjs`、`语气挖掘.mjs`
- 其余：`内核 接续 技能 台账 开工 审判 呈现 取证 合规 回归 交付 交接 件 会话管理插件修复 余额代理 主题插件 书库 临时 删 临时`

## 5. 本地源码副本 v38（残缺，只读调研）

- 路径：`C:\Users\Administrator\Desktop\3\pull\shell\x\dsh-mobile-apk`
- 顶层：`app base build.gradle.kts dsh-client-ui-responsive dsh-host-web-compat dsh-shell-termux gradle plugins release scripts vendor`
- `settings.gradle.kts` 只 `include(":app")`；仓库 google()+mavenCentral()，RepositoriesMode.FAIL_ON_PROJECT_REPOS
- `plugins/` 现存 7 个：`dsh-android-bridge / browser / file-open / linux-env / manage / vdisplay / model-capability`
  ⚠ 真机生产插件 `dsh-kickoff-gate` **不在其中**
- ⚠ `git status` 有 **75 个删除**（`dsh-client-ui-responsive` 47 / `plugins` 27 / `dsh-shell-termux/src` 1）
- ⚠ `dsh-shell-termux/src` 现为**空目录**
- ⚠ 平板上 `/storage/emulated/0/3/工具/自研壳/out/shell.apk` 仅 **1167 字节**（2026-09-17）→ 占位/坏产物，不是真包
- 编译环境已就绪：`tools/jdk`（JDK17）、`tools/android-sdk`（platform36+bt36）、Gradle 8.11.1
  → `--dry-run` 已 BUILD SUCCESSFUL；一键 `build.bat`

## 6. 已确诊的问题（332 窗 + 最近一周 42 窗精读结论，勿重写）

详见 `analyze/out/发现.md` 与 `analyze/out/最近一周.md`。要点：

1. **在跑旧货**：生产插件 `dsh-kickoff-gate/lib/index.js` md5 与 0926 备份逐字节相同 → 09-27 后接线全回退；根因缺 `inject`，需重启
2. **记忆内核坏**：长期记忆 60 条只开窗注入一次，`reinject:false` 吃掉不回来；73 条负知识编译好**没接检索口** → 同坑反复踩（NK-006 已第三次）
3. **门是摆设**：119 门只有 8 处真拦；ENTER-GATE 是哑门（`if(hasCard)` 在 kickoff-gate/lib/index.js:1404/1484）；放行"用过"恒 0
4. **系统自伤**：「上一轮未结红」硬停闸关掉整个工具面，她无法自救（`6e40704b` 第二次复现）
5. **分不清老板话 vs 系统注入**：`e6954dac` 老板一字未说，她把注入块当原话，前 30 步全白跑
6. **核验工具报假**：`\xad` 软连字符使 24/30 引文核不中；「今天动过」假绿；`跑.mjs:147` 测不出却报绿
7. **打烊缺「抽针→出卡」**：三窗独立定位同一处，`台账/轮末/打烊规程.md` 无落点，已出过 0 针卡
8. **过期状态当现令**：状态行无过期标记
9. **三套"在办"口径互不相接**：`状态行.json` goal-54577121 / `交接单_045` / `台账/在办.md`
10. **考 15 次栽同一处**：错判据「尖上字节不涨才许落」躺在每窗注入的【关于老板】1003 四条令里，与老板原话打架且错的赢 → 考试无效
11. **明文 API key 第二次出现**（`83312d60`，`sk-u2nq…`），窗口标题整条是 key → 需轮换
12. 上下文峰值 54.6 万/80 万 = **68%**；成功率：全量 32% 没做成，最近一周 45% 没做成
13. 老板 10-25 亲裁方向（`64723b1a`）：**重构建壳 + 门加注释减负 + 记忆库外挂 + 引擎走官方只维护壳 + 信箱建专用通道**；同窗点破"门太多、门没出题导致你猜题"

## 7. 老板本轮诉求（要做进下一版）

- 合并：最新平板版（v51）+ 本地副本（v38）→ 下一版本
- 加：主代理的优化
- 移植：WorkBuddy（本机工作平台）上好的东西给她
- 保留：她的编程能力 + 本地编程环境
- 新增：**3D 建模 + 做图**功能
- 新增：**上下文管理优化**
- 新增：**上下文连续性保证 + 跨窗口交接数据库**用上
- 交付物：**联合专家给出的可执行方案**

## 8. WorkBuddy（本机平台）可移植的好东西（供移植专家评估）

三层记忆（云画像 / 用户级 MEMORY.md / 工作区日志+MEMORY.md）、Skills（SKILL.md 自描述、按需加载）、
子代理并行 + 契约化输出 + 主代理审核、TaskCreate/TaskUpdate 任务板、automation 定时任务、
deliver_attachments 产物回传、preview/open_result_view 结果呈现、Visualizer 内联可视化、
find-skills 能力检索、安全审计（skill 安装前）、专家中心 100+ 领域专家。
