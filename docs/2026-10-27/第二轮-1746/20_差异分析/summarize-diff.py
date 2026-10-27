# -*- coding: utf-8 -*-
"""把 snapshot-diff 明细归纳成可读清单：按目录聚合 + 她关心的 6 件自带件单列。"""
import re, collections, sys

path = sys.argv[1] if len(sys.argv) > 1 else "plan/out/snapshot-diff-v51-v52.txt"
src = open(path, encoding="utf-8").read().splitlines()

sections, cur = {}, None
for ln in src:
    m = re.match(r"^== (.+?) \((\d+)\) ==$", ln)
    if m:
        cur = m.group(1)
        sections[cur] = []
        continue
    if ln.startswith("== "):
        cur = None
        continue
    if cur and ln.strip():
        sections[cur].append(ln.strip())

def base(p):
    return p.split()[0]

def agg(paths, depth=4, top=18):
    c = collections.Counter()
    for p in paths:
        key = "/".join(base(p).split("/")[:depth])
        c[key] += 1
    return c.most_common(top)

GROUPS = {
    "app-boot（自带件）": "app-boot",
    "client-modules（自带件）": "client-modules",
    "fs-local（自带件）": "fs-local",
    "session-persistence（自带件）": "session-persistence",
    "node-addon-system（自带件）": "node-addon-system",
    "ptc-runtime（自带件）": "ptc-runtime",
    "kickoff-gate（件门）": "kickoff-gate",
    "pins": "pins",
    "cordis.patch": "cordis.patch",
    "AGENTS.md": "AGENTS.md",
    "presets": "/presets/",
    "工具/门": "/tools/",
}

for sec in ["只在旧", "只在新", "大小变", "大小同内容变"]:
    ps = sections.get(sec, [])
    print("\n" + "=" * 70)
    print("## %s  共 %d" % (sec, len(ps)))
    print("=" * 70)
    print("-- 按目录聚合（前 4 层，top18）--")
    for k, v in agg(ps):
        print("  %5d  %s" % (v, k))
    print("-- 关键组命中 --")
    for label, kw in GROUPS.items():
        hits = [p for p in ps if kw in p]
        if hits:
            print("  %-28s %4d" % (label, len(hits)))
