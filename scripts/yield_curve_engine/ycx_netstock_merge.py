#!/usr/bin/env python3
"""
ycx_netstock_merge.py
Inject net forest+products+landfill carbon as metric net_forest_hwp_c under all
four management buckets, per state + US, model yc_hwp_v1. Carbon-stock only
(standing live + HWP in-use + landfill); substitution is a separate sensitivity
and is NOT included here. Additive + idempotent.

Usage: python3 ycx_netstock_merge.py <conus_hwp_netstock_bystate.csv> <api_dir>
"""
import csv, json, os, sys
from collections import defaultdict
csvpath, api = sys.argv[1], sys.argv[2]
MODEL, CLS = "yc_hwp_v1", "YC"
LABEL = "Forest + wood products + landfill net carbon (HWP first-order decay, hybrid engine)"
METRIC = "net_forest_hwp_c"
MDEF = {"label":"Net carbon: forest + wood products + landfill","unit":"Tg C","kind":"stock","group":"carbon"}

by_state = defaultdict(lambda: defaultdict(dict)); us = defaultdict(lambda: defaultdict(float)); bks=set()
for r in csv.DictReader(open(csvpath)):
    bk=r["scenario"]; y=2022+int(r["year_offset"]); tg=float(r["net_stock_Tg"]); bks.add(bk)
    by_state[r["state"]][bk][y]=tg; us[bk][y]+=tg

def pts(d): return [[y, round(d[y],1)] for y in sorted(d)]
def inject(series, bdata):
    node_metric=series.setdefault(METRIC,{})
    for bk,yrs in bdata.items():
        node=node_metric.setdefault(bk,[]); node[:]=[s for s in node if s.get("model")!=MODEL]
        node.append({"model":MODEL,"cls":CLS,"label":LABEL,"pts":pts(yrs)})

n=0
for st,bd in sorted(by_state.items()):
    p=os.path.join(api,"series",f"{st}.json"); ser=json.load(open(p)) if os.path.exists(p) else {}
    inject(ser,bd); json.dump(ser,open(p,"w"),separators=(",",":")); n+=1
up=os.path.join(api,"series","US.json"); uj=json.load(open(up)) if os.path.exists(up) else {}
inject(uj,us); json.dump(uj,open(up,"w"),separators=(",",":"))
mp=os.path.join(api,"meta.json"); M=json.load(open(mp)); M.setdefault("metrics",{})[METRIC]=MDEF
json.dump(M,open(mp,"w"),indent=1,ensure_ascii=False); open(mp,"a").write("\n")
print(f"Injected {METRIC} ({len(bks)} buckets) into {n} states + US.")
for bk in sorted(bks):
    y=us[bk]; print(f"  {bk:24s} {us[bk][min(y)]:.0f} -> {us[bk][max(y)]:.0f} Tg")
