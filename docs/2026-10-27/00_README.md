# 2026-10-27 · 电脑侧成果（v52 造壳）

> 来源机：网吧 Windows（31GB 内存，OOM 风险高）。
> 推送缘由：老板令「先推 GitHub，再继续重构」——机器随时可能因内存击穿重启清盘，只有推出去的才算数。
> 推送时间：2026-10-27 16:2x（+0800）

## 一、这包里是什么

| 目录 | 内容 | 为什么重要 |
|---|---|---|
| `01_方案/` | 30 条交叉核对、v52 执行清单（合并版）、待拍板决策单、真机核验对照、下一版本方案、六份专家方案 01~06 | **不可再生**——思路重写不出来 |
| `02_构建/` | 内存受限构建配方 `build-v52.bat`、回灌合并后的 `cordis.patch`、`CONTEXT.md`（已修正 3 条事实错误） | 踩过的坑不重踩 |
| `03_施工记录/` | 当日工作日志、项目长期记忆 | 下一个窗口的入口 |
| `今天动过.txt` | 按**时间**筛（非后缀）的全量改动清单，含明确排除项与理由 | 清单与包对账用 |
| `今天成果_1027.tgz` | 上述内容的整包（19 个文件） | 一次拿走 |
| `今天成果_1027.sha256` | 整包指纹 | **回读校验用** |

## 二、整包指纹

```
4674dfe5a81ccdc47a593d81e5ba7c645b4c6dc2c8ba95bb9915f9599562b481  今天成果_1027.tgz
```

⚠ 本 README 在打包**之后**写入，故不在 tgz 内。tgz 内含 19 个文件，指纹以 `今天成果_1027.sha256` 为准。

## 三、核验方式（照信里的规矩：推了不回读 = 没推）

```bash
curl -sL -o /tmp/back.tgz \
  https://raw.githubusercontent.com/su-qingqing/dsh-mobile-apk/main/docs/2026-10-27/今天成果_1027.tgz
sha256sum /tmp/back.tgz
# 与上面 4674dfe5… 逐位对上才算推成功
```

## 四、当日三个硬结论（都已用真机/代码核过，不是推演）

1. **边界1 安全**：`reasoningEffort: max` 升级不会被抹。
   `SnapshotTransaction.kt:615` = patch 按 id 合并、live 为基、只追加缺失的工厂块；
   `FactoryProfilePatch.kt:35` = 工厂权威仅限 `disabled` 键，"条目内其它用户内容不动"。
2. **OOM 是自己作的**：照搬 `-Xmx4g` + `parallel=true`，未关 Kotlin 独立 daemon，失败后连重启 4 次导致 JVM 叠加。
   配方已改为 `-Xmx3g` / `max-workers=2` / `parallel=false` / `kotlin.compiler.execution.strategy=in-process`。
3. **下载校验规矩**：代理只负责快慢，真伪必须用 `api.github.com` 的资产 `digest` 独立核；
   `snapshot-arm64.tar.xz` 实测 `139f048a…ad843a`，156,777,280 B，两边一致。

## 五、v52 构建产物状态

- `app-debug.apk` 161,887,582 B，`versionCode=52` / `versionName=0.14.8`
- 签名证书 SHA-256 `1dde9d98…45bcbd`（repo 固定 `keystore/debug.keystore`，与官方同钥，可 `install -r`）
- 验真：`assembleDebug` 重跑 → 45 task / `BUILD SUCCESSFUL` / 36 up-to-date
- 未装机原因：设备 USB 中途物理断开（现已恢复，待 `install -r`）

## 六、还没做完的

- [ ] `install -r` 装机 + 装后核 `reasoningEffort: max` 在位
- [ ] 启动冒烟（node / python3 / clang / LD_LIBRARY_PATH 四条，防假绿）
- [ ] 30 条里 P1~P4 的实装项
