# 交付单 · clang 断链修复 + D3 回灌（2026-10-27 17:05 终检）

## 一、clang 断链 —— 已修复并验证

**故障**：`$U/bin/clang` 是指向 `clang-21` 的悬空符号链接，`clang-21` 本体缺失（`ls` 报 `inaccessible or not found`）。属升级前既有的残缺，非本次回归。`clang++ / cpp / g++` 同样悬空。

**处置**：不联网、不改 `install-clang.sh`，走它设计里本来就有的同一条路径 —— 从设备既有缓存
`$U/var/cache/apt/archives/` 的 9 个 deb（clang / libllvm / llvm / lld / libcompiler-rt / binutils / ndk-sysroot / libicu / libxml2）
用 `dpkg-deb -x` 解包后 `cp -an` 平移到 `$U`（不覆盖任何既有文件）。

**必须同时具备的 4 个环境变量**（少任何一个都会失败，已写入项目记忆）：
```sh
export PATH=$U/bin:/system/bin            # 缺则 dpkg-deb 调到 toybox tar，报 Unknown option 'warning=no-timestamp'
export LD_LIBRARY_PATH=$U/lib
export LD_PRELOAD=$U/lib/libtermux-exec-ld-preload.so
export TMPDIR=$F/home/tmp                 # 缺则 clang: unable to make temporary file
```

**验证结果**：
| 检查 | 结果 |
|---|---|
| `clang --version` | `clang version 21.1.8` / `Target: aarch64-unknown-linux-android24` |
| `$U/bin/clang-21` | 121,040 B，可执行，在位 |
| `clang -> clang-21`、`clang++ -> clang-21` | 链接不再悬空 |
| C 冒烟 | `clang-ok`，rc=0 |
| C++ 冒烟 | `cpp-ok`，rc=0 |

**未动的东西**：出厂目录、`install-clang.sh`、任何联网源。临时目录已清理。

---

## 二、D3 回灌 —— 已按「逐段评审追加」落地

### 审计结论（不是猜的，三份脚本对跑）
- v0.14.8 权威 22 段：**一个都不缺**
- 她现役独有 13+ 段定制：**必须保**
- **唯一真缺口**：`ptc-runtime` 仍在用被删除的 `nodeExecutable`

为什么这是真缺口：`ptc-runtime-node 0.2.1-rc.2` 把 `nodeExecutable` 删了，改成必填联合类型 `launch: {kind: 'node-script'|'embedded', executable, bootstrapPath?}`，且**没有 `.default()`** ⇒ 不再回落 `process.execPath`。留着旧键，`resolveLaunch(undefined)` 会拿到空壳，Android 上语义错位。

### 唯一改动（`profiles/web/cordis.patch.yml:289-293`）
```yaml
- id: ptc-runtime
  config:
    # 0.14.8 追版（ptc-runtime-node 0.2.1-rc.2 已删 nodeExecutable，改为必填 launch 联合类型；缺省不再回落）
    launch:
      kind: node-script
      executable: /data/data/com.dsharnessmobile.shell/files/usr/libexec/dsh-node
```
回滚点：`cordis.patch.yml.bak-1027-前ptc追版`（63,125 B）

### 明确不做的事
| 项 | 原因 |
|---|---|
| 整文件替换 `profile-web.cordis.patch.merged.yml` | 会丢 `ins:model-capability` 段、把 `reasoningEffort` 打回 `high` ⇒ **永久弃用该稿** |
| 回灌 `agent-default-model` | 权威值是 `deepseek-v4-flash`，会抹掉她的 `deepseek-account/deepseek-flash` + `max` |
| 回灌 `office-to-pdf` / `android-file-open` / `android-vdisplay` | 只差尾注注释，功能挂载行一致，无害 |

---

## 三、终态硬证据

| 项 | 实测 |
|---|---|
| 设备 patch sha256 | `116723428feba659629db136aa3cc295e17a3212cc4b072f0ac7b592b0ed2679`（63,290 B，48 个顶层条目） |
| 电脑侧存档 | `plan/out/live-v52-final-patch.yml`，同 sha256，**与设备逐字节一致** |
| 边界 1 | `:109 reasoningEffort: max` ✓（`:107 provider: deepseek-account`、`:108 model: deepseek-flash`） |
| 边界 2 | 出厂 `agent-presets` 零改动 ✓ |
| 进程 | 壳 `27872` + 引擎 `28137`，父子关系已核 |
| 引擎命令行 | `/system/bin/linker64 …/usr/bin/node --expose-internals …/lib/bin.js web --port 3080 --no-open` |
| 引擎环境 | `LD_LIBRARY_PATH=…/files/usr/lib`、`TMPDIR=…/files/home/tmp`（PTC 自行注入，壳进程自身 environ 里没有这两项） |
| 端口可用性 | `nc 127.0.0.1 3080` → `HTTP/1.1 401 Unauthorized` + `cache-control: no-store`（鉴权生效，预期行为） |
| 设备端断言 | `pull/_probe/verify-d3.mjs` 12 条 **ALL_PASS**（仅 2 条 `!!js` 自定义 tag 的 YAMLWarning，出厂既有写法） |

---

## 四、我这两处口径错了，已更正

1. **`reasoningEffort` 不是 `high`。** 我先前说现役是 `high`，复核后发现：`high` 只存在于我 16:54 拉的快照和 16:42 的备份里；设备 16:55 之后一直是 `max`。**边界 1 从未被破。**
2. **`/proc/net/tcp` 在 run-as 沙箱里不可读**（`Permission denied`），我第一次用它查 3080 得到的 "none" 是**假阴性**。换 `/system/bin/nc` 才拿到真结论。以后探端口一律用 nc。

另有一条容易误判的：`linker64 $U/bin/node` 不带 `LD_LIBRARY_PATH` 会报 `libz.so.1 not found`（libz 只在 `$U/lib`）。手动验链路要自己 export；PTC 子进程本身有注入，别当成回归。

---

## 五、顺手补的第三件：影子比对器（已落地）

`01` 号方案 M5 原本要把仓库权威 patch **整文件写回覆盖现役**，这会抹掉 `reasoningEffort: max`，已被永久否决。替代方案是「放一份影子在旁边比对」，本回合已做完：

| 产物 | 说明 |
|---|---|
| `plan/out/cordis.patch.repo.yml` | 仓库权威版影子副本（17,244 B，sha256 `c5c46464…9355c06`），**只读比对用** |
| `plan/diff-repo-vs-live.mjs` | 比对器：只打印、绝不写回任何 patch；有「权威有而现役缺」时 exit 1，可直接挂校验器 |

**首跑结果**（对 `live-v52-final-patch.yml`）：
```
影子(仓库权威) 22 段 / 现役 49 段
  · 权威有、现役缺 ：0   <-- 真缺
  · 两边都有但不同 ：5   <-- 均为她的定制
  · 完全一致       ：17
结论：权威装配零缺失     [exit=0]
```

那 5 段「不同」已逐段查清：`agent-default-model`（她的 `deepseek-account/deepseek-flash` + `max` 必须保）、`ptc-runtime`（语义等价，权威多 3 行注释）、`office-to-pdf` / `android-file-open` / `android-vdisplay`（仅尾注差异，挂载行一致）。**没有一处是功能缺口。**

---

## 六、唯一没动的一项，以及为什么不动

**`memory.db` 三份库并行**：`.dsh-own`(6.0MB) / `.dsh-meow`(6.4MB，今天还在写) / 10-14 旧副本(2.4MB)，违反 `cordis.patch.yml:898`「旧的退役、不并行」。

这一项我不碰。退役任何一份都是**不可逆的数据删除**，涉及她自己的记忆内容，不属于我能自己拍的范畴。方案已经写好放在那儿：留 `.dsh-own` 为真源、`.dsh-meow` 迁移后退役、10-14 旧副本原样保留当回滚点。她哪天要收，照这个执行即可。

---

## 七、复发风险（当前就该知道）

出厂 `config/agent-presets/{standard,code,cordis}/agent.cordis.yml` 里仍带 `{{cwd}}`。v0.14.8 对未注册 prompt 变量是**抛错**而非忽略。**一旦在 UI 里切到这三个出厂 preset，发消息会立刻再报 `unknown prompt variable "{{cwd}}"`。** 出厂目录一个字节不许动（边界 2），所以只能保护在自己 patch 侧 —— 现在 `preset-suqingqing` 那条已经改成静态句了，别的 preset 没兜底。
