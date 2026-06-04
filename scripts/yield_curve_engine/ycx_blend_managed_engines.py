#!/usr/bin/env python3
"""ycx_blend_managed_engines.py
Apply the reserved-status-aware managed recalibration to one or more YC-family engines.
Same two-part holdout as the FIA engine (per-state reserved share r never harvested,
working fraction phi on non-reserved => phi_eff=(1-r)*phi), but generalized to any model
id so yc_hybrid_v1 and yc_treemap_spatial_v1 stop showing whole-landscape rotation
declines. Each engine is blended against its OWN reserve trajectory. US re-summed from
blended states.
Usage: python3 ycx_blend_managed_engines.py <api_dir> <reserved_csv> <model1,model2,...>
"""
import json, os, sys, csv, glob
api, rcsv, models = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
METRICS = ["agc_live_total","agb_dry","vol_stem","merch_vol_mcf","merch_bio_dry"]
PHI = {"harvest": 0.10, "intensive": 0.20, "conservation": 0.05}
VARIANTS = ["", ", disturbance-exposed", ", mortality-stressed"]
R_DEFAULT = 0.042
rshare = {row["state"]: float(row["reserved_share"]) for row in csv.DictReader(open(rcsv))}

def node(bl, model):
    for s in bl or []:
        if s.get("model") == model: return s
    return None

def blend_state(path, r):
    d = json.load(open(path)); touched = 0
    for met in METRICS:
        mm = d.get(met)
        if not mm: continue
        for model in models:
            for regime, phi in PHI.items():
                phe = (1.0 - r) * phi
                for v in VARIANTS:
                    rn = node(mm.get(f"reserve (no harvest{v})"), model)
                    mn = node(mm.get(f"managed ({regime}{v})"), model)
                    if rn is None or mn is None: continue
                    rmap = {p[0]: p for p in rn["pts"]}
                    out = []
                    for p in mn["pts"]:
                        rp = rmap.get(p[0])
                        if rp is None: out.append(p); continue
                        out.append([p[0]] + [round(phe*p[i] + (1-phe)*rp[i], 3) for i in range(1, len(p))])
                    mn["pts"] = out; touched += 1
    if touched:
        json.dump(d, open(path, "w"), separators=(",", ":")); open(path, "a").write("\n")
    return touched

states = []
for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    st = os.path.basename(f)[:-5]
    if st == "US": continue
    if blend_state(f, rshare.get(st, R_DEFAULT)): states.append(st)

usf = os.path.join(api, "series", "US.json"); us = json.load(open(usf))
sd = {st: json.load(open(os.path.join(api, "series", f"{st}.json"))) for st in states}
for met in METRICS:
    if met not in us: continue
    for model in models:
        for regime in PHI:
            for v in VARIANTS:
                bk = f"managed ({regime}{v})"
                un = node(us[met].get(bk), model)
                if un is None: continue
                agg = {}
                for st in states:
                    nn = node(sd[st].get(met, {}).get(bk), model)
                    if nn is None: continue
                    for p in nn["pts"]:
                        a = agg.setdefault(p[0], [0.0]*(len(p)-1))
                        for i in range(1, len(p)): a[i-1] += p[i]
                if agg: un["pts"] = [[y] + [round(x,3) for x in agg[y]] for y in sorted(agg)]
json.dump(us, open(usf, "w"), separators=(",", ":")); open(usf, "a").write("\n")
print(f"blended models {models} over {len(states)} states")
for met in ["agc_live_total"]:
    for bk in ["managed (harvest)","managed (intensive)"]:
        for model in models:
            s = node(us[met].get(bk), model)
            if s:
                p = sorted(s["pts"]); print(f"  {bk:20s} {model:22s} {p[0][1]:.0f}->{p[-1][1]:.0f} ({100*(p[-1][1]/p[0][1]-1):+.0f}%)")
