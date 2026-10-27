# -*- coding: utf-8 -*-
"""两个 snapshot.tar.xz 的逐文件比对（不改盘：流式读取，不落地解包）。
用法: python diff-snapshot.py <old.tar.xz> <new.tar.xz> [out.txt]
输出：只在旧 / 只在新 / 大小变 / 内容变(sha256 不同) / 完全一致
"""
import sys, tarfile, hashlib

def scan(p):
    d = {}
    with tarfile.open(p, "r:xz") as t:
        for m in t:
            if not m.isfile():
                continue
            f = t.extractfile(m)
            h = hashlib.sha256()
            while True:
                b = f.read(1 << 20)
                if not b:
                    break
                h.update(b)
            d[m.name] = (m.size, h.hexdigest())
    return d

old_p, new_p = sys.argv[1], sys.argv[2]
out_p = sys.argv[3] if len(sys.argv) > 3 else None

o = scan(old_p)
n = scan(new_p)

lines = []
lines.append("旧 %s  文件数=%d" % (old_p.split("/")[-1], len(o)))
lines.append("新 %s  文件数=%d" % (new_p.split("/")[-1], len(n)))

only_o = sorted(set(o) - set(n))
only_n = sorted(set(n) - set(o))
both = set(o) & set(n)
size_diff = sorted(k for k in both if o[k][0] != n[k][0])
sha_diff = sorted(k for k in both if o[k][0] == n[k][0] and o[k][1] != n[k][1])
same = len(both) - len(size_diff) - len(sha_diff)

lines.append("")
lines.append("== 汇总 ==")
lines.append("只在旧(删/移出): %d" % len(only_o))
lines.append("只在新(增/移入): %d" % len(only_n))
lines.append("大小变        : %d" % len(size_diff))
lines.append("大小同内容变  : %d" % len(sha_diff))
lines.append("完全一致      : %d" % same)

def dump(title, keys, extra=None):
    lines.append("")
    lines.append("== %s (%d) ==" % (title, len(keys)))
    for k in keys:
        if extra:
            lines.append(extra(k))
        else:
            lines.append(k)

dump("只在旧", only_o)
dump("只在新", only_n)
dump("大小变", size_diff, lambda k: "%s  %d -> %d" % (k, o[k][0], n[k][0]))
dump("大小同内容变", sha_diff, lambda k: "%s  (%d B)" % (k, o[k][0]))

text = "\n".join(lines)
print(text)
if out_p:
    open(out_p, "w", encoding="utf-8").write(text)
