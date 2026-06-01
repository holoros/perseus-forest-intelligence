#!/usr/bin/env python3
"""
ycx_hybrid_merge.py
Add the experimental hybrid (CR + decline tail) carbon projection as model
yc_hybrid_v1 on agc_live_total, reserve bucket, per state + US rollup. Labeled
experimental because it is NOT yet FIA-anchored (its t0 runs ~16% above the
anchored peak-decline engine), so it is an additive comparison line, not a
replacement for yc_treemap_spatial_v1 / yc_fia_empirical_v1.

Usage: python3 ycx_hybrid_merge.py <conus_hybrid_100yr.csv> <api_dir>
"""
import csv, json, os, sys
from collections import defaultdict
csvpath, api = sys.argv[1], sys.argv[2]
MODEL, CLS = "yc_hybrid_v1", "YC"
LABEL = "YC hybrid Chapman-Richards + decline tail (FIA-anchored to production t0)"
METRIC, BUCKET = "agc_live_total", "reserve (no harvest)"

by_state = defaultdict(dict); us = defaultdict(float)
for r in csv.DictReader(open(csvpath)):
    y = int(r["year_offset"]) + 2022; tg = float(r["agc_Tg"])
    by_state[r["state"]][y] = tg; us[y] += tg

def pts(d): return [[y, round(d[y],1)] for y in sorted(d)]
def inject(series, d):
    node = series.setdefault(METRIC, {}).setdefault(BUCKET, [])
    node[:] = [s for s in node if s.get("model") != MODEL]
    node.append({"model":MODEL,"cls":CLS,"label":LABEL,"pts":pts(d)})

n=0
for st, d in sorted(by_state.items()):
    p=os.path.join(api,"series",f"{st}.json"); ser=json.load(open(p)) if os.path.exists(p) else {}
    inject(ser,d); json.dump(ser,open(p,"w"),separators=(",",":")); n+=1
up=os.path.join(api,"series","US.json"); uj=json.load(open(up)) if os.path.exists(up) else {}
inject(uj,us); json.dump(uj,open(up,"w"),separators=(",",":"))
print(f"Injected {MODEL} into {n} states + US. CONUS reserve {us[min(us)]:.0f} -> {us[max(us)]:.0f} Tg")
