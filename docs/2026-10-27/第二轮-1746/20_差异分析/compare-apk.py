# -*- coding: utf-8 -*-
"""新旧 APK 逐项对比：判定「重编译产物」与「已装机版」是否功能等价。
用法: python compare-apk.py <old.apk> <new.apk>
"""
import sys, zipfile, hashlib, os

def sha(b):
    return hashlib.sha256(b).hexdigest()

def scan(p):
    d = {}
    with zipfile.ZipFile(p) as z:
        for i in z.infolist():
            if i.is_dir():
                continue
            d[i.filename] = (i.file_size, sha(z.read(i.filename)))
    return d

old_p, new_p = sys.argv[1], sys.argv[2]
o, n = scan(old_p), scan(new_p)

print("旧: %s  %d B  sha=%s" % (os.path.basename(old_p), os.path.getsize(old_p), sha(open(old_p,'rb').read())[:16]))
print("新: %s  %d B  sha=%s" % (os.path.basename(new_p), os.path.getsize(new_p), sha(open(new_p,'rb').read())[:16]))
print("条目数  旧=%d  新=%d" % (len(o), len(n)))
print()

only_o = sorted(set(o) - set(n))
only_n = sorted(set(n) - set(o))
diff = sorted(k for k in set(o) & set(n) if o[k] != n[k])

print("只在旧: %d" % len(only_o))
for k in only_o[:10]: print("   -", k)
print("只在新: %d" % len(only_n))
for k in only_n[:10]: print("   +", k)
print("同名不同内容: %d" % len(diff))
for k in diff[:20]: print("   ~", k, o[k], "->", n[k])
print()

# 代码层等价判定
dex_o = {k: v for k, v in o.items() if k.startswith("classes") and k.endswith(".dex")}
dex_n = {k: v for k, v in n.items() if k.startswith("classes") and k.endswith(".dex")}
dex_same = sorted(dex_o) == sorted(dex_n) and all(dex_o[k] == dex_n[k] for k in dex_o)
snap_o = o.get("assets/snapshot.tar.xz")
snap_n = n.get("assets/snapshot.tar.xz")
print("dex 文件: 旧 %d 个 / 新 %d 个 -> %s" % (len(dex_o), len(dex_n), "完全一致" if dex_same else "有差异"))
print("snapshot: %s -> %s" % (snap_o, snap_n))
print()
print("VERDICT: " + ("CODE_IDENTICAL" if dex_same else "CODE_CHANGED"))
