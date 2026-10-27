#!/usr/bin/env python3
"""APK 交付自检（确定性，无网络）。
判据全部为「等式成立」而非「看起来对」：
  1. APK zip 全量 CRC —— testzip() 返回 None 才算结构完整
  2. APK 内 assets/snapshot.tar.xz 的 sha256 == 源文件 sha256（证明打包没坏）
  3. 源 snapshot.tar.xz 的 sha256      == assets/snapshot.sha256 里记的值
  4. manifest / dex / resources.arsc / classes.dex 必备项在场
退出码：0 全通过；1 有任一项不成立。
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"C:\Users\Administrator\Desktop\3\pull\shell\x\dsh-mobile-apk-v52")
APK = ROOT / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
SNAP = ROOT / "app" / "src" / "main" / "assets" / "snapshot.tar.xz"
SNAPSHA = ROOT / "app" / "src" / "main" / "assets" / "snapshot.sha256"
META = APK.parent / "output-metadata.json"

fails = []


def check(cond, label, detail=''):
    print(('  OK   ' if cond else '  FAIL ') + label + (f'  [{detail}]' if detail else ''))
    if not cond:
        fails.append(label)


print('== 前置 ==')
for p in (APK, SNAP, SNAPSHA, META):
    check(p.exists(), f'存在 {p.name}', f'{p.stat().st_size:,} B' if p.exists() else 'missing')
if fails:
    print('\n[exit=1] 前置缺失，后续无法验')
    sys.exit(1)

size_apk = APK.stat().st_size
print(f'\n== APK ==  {size_apk:,} B')

meta = json.loads(META.read_text(encoding='utf-8'))
el = meta['elements'][0]
check(el['versionCode'] == 52, 'output-metadata versionCode == 52', str(el['versionCode']))
check(el['versionName'] == '0.14.8', 'output-metadata versionName == 0.14.8', el['versionName'])

z = zipfile.ZipFile(APK)
names = z.namelist()
print(f'\n== 结构 ==  共 {len(names)} 个条目')

bad = z.testzip()
check(bad is None, 'zip 全量 CRC 通过（testzip）', 'all entries ok' if bad is None else f'corrupt: {bad}')

for must in ('AndroidManifest.xml', 'classes.dex', 'resources.arsc'):
    check(must in names, f'必备项在场 {must}')

snap_in_apk = [n for n in names if n.endswith('snapshot.tar.xz')]
check(len(snap_in_apk) == 1, 'APK 内恰有 1 份 snapshot.tar.xz', str(snap_in_apk))

snap_sha = [n for n in names if n.endswith('snapshot.sha256')]
check(len(snap_sha) == 1, 'APK 内带 snapshot.sha256', str(snap_sha))

print('\n== 快照指纹 ==')
h_src = hashlib.sha256(SNAP.read_bytes()).hexdigest()
recorded = SNAPSHA.read_text(encoding='utf-8').strip().split()[0]
print(f'  源文件     {h_src}  ({SNAP.stat().st_size:,} B)')
print(f'  记录值     {recorded}')
check(h_src == recorded, '源 snapshot.tar.xz 与 snapshot.sha256 记录一致')

if snap_in_apk:
    data = z.read(snap_in_apk[0])
    h_apk = hashlib.sha256(data).hexdigest()
    print(f'  APK 内     {h_apk}  ({len(data):,} B)')
    check(h_apk == h_src, 'APK 内快照与源文件逐字节一致')
    check(len(data) == SNAP.stat().st_size, 'APK 内快照大小与源文件一致')

print('\n== 签名 ==')
signers = [n for n in names if n.startswith('META-INF/') and n.upper().endswith(('.RSA', '.DSA', '.EC'))]
check(len(signers) >= 1, 'APK 已签名（META-INF 下有签名块）', str(signers))

print()
if fails:
    print(f'[exit=1] {len(fails)} 项不成立：')
    for f in fails:
        print('   - ' + f)
    sys.exit(1)
print('[exit=0] 全部判据成立')
