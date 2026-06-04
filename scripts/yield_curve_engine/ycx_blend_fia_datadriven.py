#!/usr/bin/env python3
"""ycx_blend_fia_datadriven.py
Data-driven managed recalibration for the FIA engine (yc_fia_empirical_v1), applied to a
FULL-ROTATION managed source (the state after a fresh FIA pipeline regeneration). Each
managed bucket is blended with its matching reserve bucket using a FIADB-derived per-state
working fraction:
    managed (harvest)      phi = harvested_share   (observed FIA harvest treatment)
    managed (conservation) phi = harvested_share   (same working forest, light regime)
    managed (intensive)    phi = planted_share     (plantations only, STDORGCD=1)
    managed_new = phi * managed_full + (1 - phi) * reserve
Reserved (protected) land is excluded by construction (reserved plots are neither harvested
nor planted). Applied per state across all stock metrics and disturbance/mortality variants;
US re-summed from blended states. Idempotent only on a full-rotation source -- run once after
each FIA regeneration.
Usage: python3 ycx_blend_fia_datadriven.py <api_dir> <fia_mgmt_shares_bystate.csv>
"""
import json, os, sys, csv, glob
api, scsv = sys.argv[1], sys.argv[2]
MODEL = "yc_fia_empirical_v1"
METRICS = ["agc_live_total","agb_dry","vol_stem","merch_vol_mcf","merch_bio_dry"]
REGIMES = ["harvest","conservation","intensive"]
VARIANTS = ["", ", disturbance-exposed", ", mortality-stressed"]
sh = {r["state"]: (float(r["planted_share"]), float(r["harvested_share"]))
      for r in csv.DictReader(open(scsv))}

def phi(regime, planted, harvested):
    return planted if regime == "intensive" else harvested

def node(bl):
    for s in bl or []:
        if s.get("model") == MODEL: return s
    return None

def blend(path, st):
    planted, harvested = sh.get(st, (0.0, 0.0))
    d = json.load(open(path)); touched = 0
    for met in METRICS:
        mm = d.get(met)
        if not mm: continue
        for regime in REGIMES:
            ph = phi(regime, planted, harvested)
            for v in VARIANTS:
                rn = node(mm.get(f"reserve (no harvest{v})"))
                mn = node(mm.get(f"managed ({regime}{v})"))
                if rn is None or mn is None: continue
                rmap = {p[0]: p for p in rn["pts"]}
                out = []
                for p in mn["pts"]:
                    rp = rmap.get(p[0])
                    if rp is None: out.append(p); continue
                    out.append([p[0]] + [round(ph*p[i] + (1-ph)*rp[i], 3) for i in range(1, len(p))])
                mn["pts"] = out; touched += 1
    if touched:
        json.dump(d, open(path, "w"), separators=(",", ":")); open(path, "a").write("\n")
    return touched

states = []
for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    st = os.path.basename(f)[:-5]
    if st == "US": continue
    if blend(f, st): states.append(st)

usf = os.path.join(api, "series", "US.json"); us = json.load(open(usf))
sd = {st: json.load(open(os.path.join(api, "series", f"{st}.json"))) for st in states}
for met in METRICS:
    if met not in us: continue
    for regime in REGIMES:
        for v in VARIANTS:
            bk = f"managed ({regime}{v})"
            un = node(us[met].get(bk))
            if un is None: continue
            agg = {}
            for st in states:
                nn = node(sd[st].get(met, {}).get(bk))
                if nn is None: continue
                for p in nn["pts"]:
                    a = agg.setdefault(p[0], [0.0]*(len(p)-1))
                    for i in range(1, len(p)): a[i-1] += p[i]
            if agg: un["pts"] = [[y] + [round(x,3) for x in agg[y]] for y in sorted(agg)]
json.dump(us, open(usf, "w"), separators=(",", ":")); open(usf, "a").write("\n")
print(f"FIA data-driven managed blend over {len(states)} states")
for met in ["agc_live_total"]:
    for bk in ["managed (harvest)","managed (conservation)","managed (intensive)"]:
        s = node(us[met].get(bk))
        if s: p=sorted(s["pts"]); print(f"  CONUS {bk:24s} {p[0][1]:.0f}->{p[-1][1]:.0f} ({100*(p[-1][1]/p[0][1]-1):+.0f}%)")
for st in ["ME","GA","FL","OR"]:
    d=json.load(open(os.path.join(api,"series",f"{st}.json"))); o=[]
    for bk in ["reserve (no harvest)","managed (harvest)","managed (intensive)"]:
        s=node(d["agc_live_total"].get(bk))
        if s: p=sorted(s["pts"]); o.append(f"{bk.split('(')[1].rstrip(')')[:4]}:{100*(p[-1][1]/p[0][1]-1):+.0f}%")
    print(f"  {st}: "+"  ".join(o))
