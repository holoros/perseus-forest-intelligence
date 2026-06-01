#!/usr/bin/env python3
"""
ycx_products_scenarios_merge.py
Inject product-resolved standing biomass under ALL FOUR management buckets into
the PERSEUS api/series, from ycx_treemap_products_scenarios.R output. Three
metrics (sawtimber/pulpwood/residue), model yc_treemap_spatial_v1, per state +
US rollup. Registers metrics in meta.json. Additive + idempotent.

Usage: python3 ycx_products_scenarios_merge.py <conus_products_scenarios_100yr.csv> <api_dir>
"""
import csv, json, os, sys
from collections import defaultdict

csvpath, api = sys.argv[1], sys.argv[2]
MODEL, CLS = "yc_treemap_spatial_v1", "YC"
LABEL = "YC TreeMap-2022 product-resolved standing biomass"
TM_BASE = 2022
PROD2METRIC = {"sawtimber":"sawtimber_bio_dry","pulpwood":"pulpwood_bio_dry","residue":"residue_bio_dry"}
METRIC_DEFS = {
 "sawtimber_bio_dry": {"label":"Sawtimber standing biomass","unit":"Tg dry biomass","kind":"stock","group":"timber"},
 "pulpwood_bio_dry":  {"label":"Pulpwood standing biomass","unit":"Tg dry biomass","kind":"stock","group":"timber"},
 "residue_bio_dry":   {"label":"Residue / non-merch standing biomass","unit":"Tg dry biomass","kind":"stock","group":"timber"},
}

# st -> metric -> bucket -> {year: Tg};  US analog
by_state = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
us = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
buckets = set()
for r in csv.DictReader(open(csvpath)):
    m = PROD2METRIC.get(r["product"]);  bk = r["scenario"];  yr = TM_BASE + int(r["year_offset"]); tg = float(r["bio_Tg"])
    if not m: continue
    buckets.add(bk)
    by_state[r["state"]][m][bk][yr] = tg
    us[m][bk][yr] += tg

def pts(yrs): return [[y, round(yrs[y],3)] for y in sorted(yrs)]

def inject(series, mdata):
    for m, bks in mdata.items():
        for bk, yrs in bks.items():
            node = series.setdefault(m, {}).setdefault(bk, [])
            node[:] = [s for s in node if s.get("model") != MODEL]
            node.append({"model":MODEL,"cls":CLS,"label":LABEL,"pts":pts(yrs)})

n=0
for st, md in sorted(by_state.items()):
    p = os.path.join(api,"series",f"{st}.json")
    ser = json.load(open(p)) if os.path.exists(p) else {}
    inject(ser, md); json.dump(ser, open(p,"w"), separators=(",",":")); n+=1
usp = os.path.join(api,"series","US.json")
usj = json.load(open(usp)) if os.path.exists(usp) else {}
inject(usj, us); json.dump(usj, open(usp,"w"), separators=(",",":"))

mp = os.path.join(api,"meta.json"); META = json.load(open(mp))
META.setdefault("metrics",{}).update(METRIC_DEFS)
json.dump(META, open(mp,"w"), indent=1, ensure_ascii=False); open(mp,"a").write("\n")

print(f"Injected {len(PROD2METRIC)} product metrics x {len(buckets)} buckets into {n} states + US.")
for m in PROD2METRIC.values():
    for bk in sorted(buckets):
        y=us[m][bk]
        print(f"  {m:20s} {bk:24s} {us[m][bk][min(y)]:7.0f} -> {us[m][bk][max(y)]:7.0f} Tg")
