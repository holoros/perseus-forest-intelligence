#!/usr/bin/env python3
"""
ycx_promote_hybrid_merge.py
Promote the FIA-anchored hybrid to the PRODUCTION DEFAULT for agc_live_total.
For all four management buckets, set yc_hybrid_v1 from the hybrid scenario
projection and label it the production default; relabel the peak-decline spatial
line (yc_treemap_spatial_v1) as a comparison line WITHIN agc_live_total only
(its use in other metrics is untouched). Records the default in meta.

Usage: python3 ycx_promote_hybrid_merge.py <conus_scenarios_hybrid_100yr.csv> <api_dir>
"""
import csv, json, os, sys
from collections import defaultdict
csvpath, api = sys.argv[1], sys.argv[2]
HYB, PD, CLS = "yc_hybrid_v1", "yc_treemap_spatial_v1", "YC"
HYB_LABEL = "YC hybrid CR+decline, FIA-anchored (PRODUCTION DEFAULT)"
PD_SUFFIX = " - peak-decline (comparison)"
METRIC = "agc_live_total"

by_state = defaultdict(lambda: defaultdict(dict)); us = defaultdict(lambda: defaultdict(float)); bks=set()
for r in csv.DictReader(open(csvpath)):
    bk=r["scenario"]; y=2022+int(r["year_offset"]); tg=float(r["agc_Tg"]); bks.add(bk)
    by_state[r["state"]][bk][y]=tg; us[bk][y]+=tg

def pts(d): return [[y, round(d[y],1)] for y in sorted(d)]
def promote(series, bdata):
    mnode = series.setdefault(METRIC, {})
    for bk, yrs in bdata.items():
        node = mnode.setdefault(bk, [])
        node[:] = [s for s in node if s.get("model") != HYB]                 # drop old hybrid
        for s in node:                                                       # relabel peak-decline once
            if s.get("model")==PD and PD_SUFFIX not in s.get("label",""): s["label"]=s.get("label","")+PD_SUFFIX
        node.insert(0, {"model":HYB,"cls":CLS,"label":HYB_LABEL,"pts":pts(yrs)})  # hybrid first = default

n=0
for st,bd in sorted(by_state.items()):
    p=os.path.join(api,"series",f"{st}.json"); ser=json.load(open(p)) if os.path.exists(p) else {}
    promote(ser,bd); json.dump(ser,open(p,"w"),separators=(",",":")); n+=1
up=os.path.join(api,"series","US.json"); uj=json.load(open(up)) if os.path.exists(up) else {}
promote(uj,us); json.dump(uj,open(up,"w"),separators=(",",":"))
mp=os.path.join(api,"meta.json"); M=json.load(open(mp))
M.setdefault("default_models",{})[METRIC]=HYB
json.dump(M,open(mp,"w"),indent=1,ensure_ascii=False); open(mp,"a").write("\n")
print(f"Promoted {HYB} to default for {METRIC} in {n} states + US ({len(bks)} buckets).")
for bk in sorted(bks):
    y=us[bk]; print(f"  {bk:24s} {us[bk][min(y)]:.0f} -> {us[bk][max(y)]:.0f} Tg")
