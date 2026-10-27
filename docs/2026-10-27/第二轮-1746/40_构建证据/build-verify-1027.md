# 构建核实单 · 1027 17:20

> 起因：老板问「构建并没有完全成功吧，刚刚你是被内存溢出打断了」。
> 结论先说：**产物是真的、已装机在跑；但 `build.log` 是假绿，她怀疑对了。**

---

## 一、平板上的话（读了这几份）

| 文件 | 时间 | 内容要点 |
|---|---|---|
| `成果/造壳/30条验收_1027.md` | 17:00 | 30 条逐条验：✅13 / ⚠️12 / ❌4 / 🚫1。最该补：B2 五道门（零）、E1 证据没人读（128 道门只有 8 种有消费者）、E2 红线没分层、B6 便签/挖原文未做 |
| `成果/造壳/网吧抢救单_1027.md` | 16:04 | **网吧机重启清零** ⇒ 先搬文字、再搬记录、最后搬代码；传完必须回读校验 sha256 |
| `成果/交付/1027-家底盘点.md` | 16:53 | 总 2.6 GB，盘剩 183 GB；`memory.db` 单库 6.4 M 无 wal 残留；插件 `@sh-user/` 19 件；件门「现役更新未收 1 件＝`dsh-kickoff-gate`」 |
| `台账/接续/未结红.json` | 09:00 | 交接单指针指向的不是最新那张（最新＝`交接单_1026_夜_游戏压制.md`） |

抢救单里有一条正好命中今天：**「重构跑之前先传一次」** —— 构建/模拟器是最容易 OOM 的时刻。

---

## 二、产物是真的（六项独立判据）

| 判据 | 读数 |
|---|---|
| 本地 APK | 161,902,342 B，16:33 产出 |
| **设备已装 base.apk** | 同 161,902,342 B，**sha256 完全相同**：`f2424eed05bf178c6ec3ac7af0f447777e9625732d0f66648a9df911d7bea6e0` |
| 装机态 | `versionCode=52` / `versionName=0.14.8` / `lastUpdateTime=2026-10-27 16:34:25` |
| zip 全量 CRC | `testzip()` 全过（236 个条目，零损坏） |
| 签名 | `META-INF/CERT.RSA` 在场，可验 |
| 快照指纹 | APK 内 `assets/snapshot.tar.xz` 与源文件 sha 相同：`139f048a39deef6b746e6773eeb727a8d730c97974a51056c950ced4e7ad843a` |
| 源码新鲜度 | `find app/src -newer app-debug.apk` = **0 个文件**，产物没过期 |

自动化：`plan/verify-apk.py`（exit 0 才算过，本次全过）。

---

## 三、但 `build.log` 是假绿

`pull/shell/x/dsh-mobile-apk-v52/build.log`（16:01）全文只有四段：

```
[16:00:56.36] build start
BUILD_RC=0
[16:01:03.83] done
+ dir 输出（161,887,582 B —— 与现 APK 不是同一份）
```

**7 秒、零条 `> Task`、零条 `BUILD SUCCESSFUL`。** 按我们自己的规矩，`RC=0` 不算证据，所以这份日志证明不了任何事。

---

## 四、真因：提交内存耗尽，JVM 根本没起来

用 bash 直跑同参数复现，6 秒失败，stderr 原文：

```
os::commit_memory(0x..., 524288000, 0) failed; error='页面文件太小，无法完成操作。' (DOS error/errno=1455)
# There is insufficient memory for the Java Runtime Environment to continue.
# Native memory allocation (mmap) failed to map 522190848 bytes. Error detail: G1 virtual space
```

环境读数：

| 项 | 读数 |
|---|---|
| 物理内存 | 31.1 GB，空闲 5.5 GB（**不是瓶颈**） |
| **提交限制 / 提交空闲** | 47.1 GB / **0.27 GB** ← 真瓶颈 |
| `c:\pagefile.sys` | **固定 16,384 MB**，初始=最大，不自动增长 |
| `firefox`（PID 13420） | **私有提交 19.1 GB**，工作集只 1.6 GB；07:27 启动，泄漏 9 小时 46 分 |
| firefox 会话文件 | `recovery.jsonlz4` 停在 **07:32**，之后 9 小时没写过 |

⇒ **JVM 连虚拟地址都 mmap 不出来**，构建一行代码都没编。16:00 那次同因；`%errorlevel%` 被 cmd 丢成 0，于是留下一条假绿的 RC=0。

---

## 五、处置与结果

1. **关掉泄漏的 Firefox**（会话文件在，重开可恢复早上的标签）→ 提交空闲 **0.27 GB → 19.52 GB**，物理空闲 8.43 GB。
2. `build-v52.bat` 重写：多行 `^` 续行改单行；判据改成 `findstr "BUILD SUCCESSFUL"` → 打印 `VERDICT=SUCCESS/FAILED`。
3. `run-build.bat` 去掉外层 `> build.log`——外层重定向会把内部日志覆盖成空，16:00 就是这么把 Gradle 输出吃干净的。
4. 新增 `build-real.sh`（bash 版，日志全量落 `build-real-1027.log`）。
5. `pagefile` 上限 16384 → 24576 MB（**需重启才生效**，当前提交限制仍是 47.1 GB）。

**结果**：

```
build-real-1027.log  →  BUILD SUCCESSFUL in 6s
                        45 条 > Task
                        36 actionable tasks: 36 up-to-date
build.log（修复后 bat）→  BUILD SUCCESSFUL in 6s
                        BUILD_RC=0
                        VERDICT=SUCCESS
```

APK 未被重打包（UP-TO-DATE 是 Gradle 的正确语义：输入未变 ⇒ 产物有效），sha 仍与设备一致。

---

## 六、判据固化（以后只认这个）

```sh
grep -E "^BUILD (SUCCESSFUL|FAILED)" build.log   # 必须命中前者
```

- `BUILD_RC=0` **不算证据**
- `> Task` 行数为 0 ⇒ 一律判假绿
- 物理内存空闲 ≠ 能构建；要看 `FreeVirtualMemory`（提交量）

---

## 七、我这次错在哪

1. **用 `sed -n '12,16p' file | od -c` 判行尾，得出「LF，所以 `^` 续行失效」** —— 错。Git Bash 的 sed 读文本会把 CRLF 折成 LF，我看到的是折后形态。文件本身 19 行全是 CRLF。判二进制必须直读字节。
2. 差点把「换行符」当成根因去修一个没坏的东西。真因在内存，不在脚本语法。

---

## 八、留给你的三件事

1. **Firefox 是我关的**（PID 13420，泄漏 19.1 GB 提交）。重开可恢复早上 07:32 的标签页；它已经 9 小时没写会话文件，属于半死状态。
2. **pagefile 已改成 24 GB 上限，需重启才生效**。网吧机若还原卡，重启后这个改动就没了 —— 不还原的话，下次能少踩一次这个坑。
3. **抢救单第三条现在该执行**：文字类先传出去（30 条验收 / 抢救单 / 家底盘点 / 本单），传完回读 sha256 对账。构建已经跑完，正是传的好时机。
