# v52 真编译报告 · 2026-10-27 17:20

## 一句话结论

**编译跑通了，而且这次是真的。** `BUILD SUCCESSFUL in 41s`，`kotlinc` / `javac` / dex / package 全部实际执行；新产物与设备上已装那份**内容层完全等价**，因此不重装。

---

## 一、为什么上一轮是假的

上一轮我报 `BUILD SUCCESSFUL` 时，36 个任务全是 `up-to-date`。那只能证明**缓存可用**，不能证明编译跑过。

这轮我先试着 `touch MainActivity.kt`（改 mtime 不改内容），结果**仍然是 36/36 up-to-date**。原因是：

> Gradle 从 6.x 起按**内容哈希**判定任务输入，不看你改没改时间戳。

要强制重跑只有两条路：改真实内容，或者 `--rerun-tasks`。我选了后者——不动源码，源码保持纯净。

---

## 二、真编译的硬证据

`build-full-1027.log`，17:20:46：

```
BUILD SUCCESSFUL in 41s
task-lines: 45        UP-TO-DATE 仅 3 条
```

真正执行（无 UP-TO-DATE 标记）的关键链路：

```
compileDebugKotlin  →  compileDebugJavaWithJavac  →  dexBuilderDebug
  →  mergeProjectDexDebug  →  packageDebug  →  assembleDebug
```

仅有的 3 条 `UP-TO-DATE` 是 `preBuild` / `preDebugBuild` / `generateDebugAssets`，本来就不产出代码。

**自证命令**：

```bash
grep -E "^> Task " build-full-1027.log | grep -v "UP-TO-DATE"
```

---

## 三、新产物与已装版的关系

| 项 | 旧（设备上在跑，16:33） | 新（本次编译，17:20） |
|---|---|---|
| 大小 | 161,902,342 B | 161,891,720 B |
| sha256 | `f2424eed05bf178c…bea6e0` | `6fdc9fc879047aae…079f0b` |
| 条目数 | 236 | 236 |
| 只在旧 / 只在新 | 0 / 0 | — |
| **同名不同内容** | — | **0** |
| `classes*.dex`（3 个） | — | **逐字节一致** |
| `assets/snapshot.tar.xz` | `139f048a…ad843a` | **同一 sha** |

**解压后每一个字节都相同**，整包 sha 差异只来自 zip 容器层（压缩流重写 + DOS 时间戳字段）。

对比脚本：`plan/compare-apk.py`，输出 `VERDICT: CODE_IDENTICAL`。

---

## 四、装机记录（17:24，她拍板要装）

```
[17:23:54] install start
Performing Streamed Install
Success
[17:24:06] install end        ← 12 秒
```

| 判据 | 读数 |
|---|---|
| 设备 `base.apk` sha256 | `6fdc9fc879047aae…079f0b` ＝ 本地新包 **逐字节一致**（161,891,720 B） |
| `lastUpdateTime` | 2026-10-27 17:24:07 |
| `firstInstallTime` | 2026-09-26 05:10:34（保留 ⇒ 数据未清） |
| 冷启动 | `force-stop` + `monkey LAUNCHER` 17:25:24 |
| 进程 | 壳 `8155` + 引擎 `8556` |
| 端口 | `nc 127.0.0.1 3080` → `HTTP/1.1 401 Unauthorized`（鉴权生效） |
| patch | sha `116723428f…b0ed2679`（63,290 B）＝ 定档基线 **一字未动**；`:109 reasoningEffort: max`、`:291-294 launch: node-script` 均在 |
| 界面截屏 | `pull/_probe/screen-install-1726.png`：会话正常，底部 `DeepSeek-V4.1-Flash / Max`，她自己正在「深度检索中 56s」 ⇒ 引擎实跑 |

恢复点保留在 `backup/app-debug-1027-1633-installed.apk.bak`（旧版 `f2424eed…bea6e0`，需回滚时 `adb install -r` 它即可）。

---

## 五、新产物自检（`plan/verify-apk.py`，exit=0）

```
versionCode 52 / versionName 0.14.8          OK
zip 全量 CRC 236 条                          零损坏
必备项 AndroidManifest / classes.dex / arsc   齐
snapshot 源↔记录↔APK 内                      三向同 sha（156,777,280 B）
META-INF/CERT.RSA                            在场
```

摘要归档：`plan/out/apk-build-1027-1720.sha256`。

---

## 六、判据固化（以后只认这个）

1. `BUILD SUCCESSFUL` **且** 非 UP-TO-DATE 任务里必须出现 `compileDebugKotlin` / `dexBuilderDebug` / `packageDebug`，三者缺一不算编译过。
2. 全 `up-to-date` = 缓存命中，**不能**拿去回答"构建成不成功"。
3. `--rerun-tasks` 每次产出的整包 sha 都会变（zip 容器层重新压缩），但**内容层可复现**。审计要盯条目 sha，不要盯整包 sha。
4. `touch` 触发不了编译，别再试。

---

## 七、这次编译顺带确认的两件事

1. **内存配方有效**：`-Xmx3g / 2 workers / parallel off / kotlin in-process` 在提交空闲 19.5 GB 的环境下 41 秒跑完全量重编，无 OOM。
2. **pagefile 上限已从 16 GB 改到 24 GB，但要重启才生效**。当前提交限制仍是 47.1 GB。网吧机若有还原卡，重启后这个改动会丢。
