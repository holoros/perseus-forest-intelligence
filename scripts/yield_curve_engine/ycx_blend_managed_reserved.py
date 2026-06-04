#!/usr/bin/env python3
"""ycx_blend_managed_reserved.py
Reserved-status-aware recalibration of the FIA managed scenarios. Operates on the
UNBLENDED (whole-landscape rotation) managed series. Two data-grounded holdouts move
land off the harvest path:
  1. FIA reserved status: the per-state reserved forest share r (RESERVCD majority) is
     legally protected and never harvested.
  2. Working-forest fraction phi: of the NON-reserved land, only fraction phi carries the
     modeled regime (the rest tracks growth), reflecting that observed FIA removals are a
     small landscape average (~0.02 %/yr).
So the effective managed fraction is phi_eff = (1 - r) * phi, and
    managed_new = phi_eff * managed_rotation + (1 - phi_eff) * reserve
applied to yc_fia_empirical_v1 across all stock metrics, all managed buckets and their
disturbance/mortality variants, per state. US is re-summed from the blended states.
Usage: python3 ycx_blend_managed_reserved.py <api_dir> <reserved_share_bystate.csv>
"""
import json, os, sys, csv, glob
api, rcsv = sys.argv[1], sys.argv[2]
MODEL = "yc_fia_empirical_v1"
METRICS = ["agc_live_total","agb_dry","vol_stem","merch_vol_mcf","merch_bio_dry"]
PHI = {"harvest": 0.10, "intensive": 0.20, "conservation": 0.05}
VARIANTS = ["", ", disturbance-exposed", ", mortality-stressed"]
R_DEFAULT = 0.042

rshare = {row["state"]: float(row["reserved_share"]) for row in csv.DictReader(open(rcsv))}

def fia_node(bl):
    for s in bl or []:
        if s.get("model") == MODEL: return s
    return None

def blend_state(path, r):
    d = json.load(open(path)); touched = 0
    for met in METRICS:
        mm = d.get(met)
        if not mm: continue
        for regime, phi in PHI.items():
            phe = (1.0 - r) * phi
            for v in VARIANTS:
                rnode = fia_node(mm.get(f"reserve (no harvest{v})"))
                mnode = fia_node(mm.get(f"managed ({regime}{v})"))
                if rnode is None or mnode is None: continue
                rmap = {p[0]: p for p in rnode["pts"]}
                out = []
                for p in mnode["pts"]:
                    rp = rmap.get(p[0])
                    if rp is None: out.append(p); continue
                    out.append([p[0]] + [round(phe*p[i] + (1-phe)*rp[i], 3) for i in range(1, len(p))])
                mnode["pts"] = out; touched += 1
    if touched:
        json.dump(d, open(path, "w"), separators=(",", ":")); open(path, "a").write("\n")
    return touched

states = []
for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    st = os.path.basename(f)[:-5]
    if st == "US": continue
    r = rshare.get(st, R_DEFAULT)
    if blend_state(f, r): states.append(st)

# US managed buckets: re-sum from blended states (reserve buckets in US already correct)
usf = os.path.join(api, "series", "US.json"); us = json.load(open(usf))
sd = {st: json.load(open(os.path.join(api, "series", f"{st}.json"))) for st in states}
for met in METRICS:
    if met not in us: continue
    for regime in PHI:
        for v in VARIANTS:
            bk = f"managed ({regime}{v})"
            un = fia_node(us[met].get(bk))
            if un is None: continue
            agg = {}
            for st in states:
                node = fia_node(sd[st].get(met, {}).get(bk))
                if node is None: continue
                for p in node["pts"]:
                    a = agg.setdefault(p[0], [0.0]*(len(p)-1))
                    for i in range(1, len(p)): a[i-1] += p[i]
            un["pts"] = [[y] + [round(x,3) for x in agg[y]] for y in sorted(agg)]
json.dump(us, open(usf, "w"), separators=(",", ":")); open(usf, "a").write("\n")

print(f"reserved-aware blend over {len(states)} states; phi={PHI}; CONUS r~{R_DEFAULT}")
for met in ["agc_live_total"]:
    for bk in ["reserve (no harvest)","managed (conservation)","managed (harvest)","managed (intensive)"]:
        s = fia_node(us[met].get(bk))
        if s:
            p = sorted(s["pts"]); print(f"  {met} {bk:24s} {p[0][1]:.0f} -> {p[-1][1]:.0f} ({100*(p[-1][1]/p[0][1]-1):+.0f}%)")
