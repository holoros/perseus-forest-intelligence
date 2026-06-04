#!/usr/bin/env python3
"""ycx_managed_datadriven.py
Replace the flat working-forest fractions with FIADB-derived per-state shares:
  managed (harvest)      working fraction = harvested_share  (observed FIA harvest)
  managed (conservation) working fraction = harvested_share  (same working forest, light regime)
  managed (intensive)    working fraction = planted_share    (plantations only, STDORGCD=1)
Reserved land is held out in all (it is excluded from harvested/planted by construction).

The currently deployed managed series were blended as
    managed = phi_eff_old * full_rotation + (1 - phi_eff_old) * reserve,
    phi_eff_old = (1 - reserved_share) * PHI_OLD[regime]
uniformly across the three YC engines. So the full-rotation deviation can be recovered
and re-weighted to the new data-driven fraction without re-running the projector:
    managed_new = reserve + (managed_deployed - reserve) * (phi_new / phi_eff_old)
per engine, metric, bucket (and disturbance/mortality variant, vs the matching reserve
variant), per state. US is re-summed from the rescaled states.
Usage: python3 ycx_managed_datadriven.py <api_dir> <fia_mgmt_shares_bystate.csv>
"""
import json, os, sys, csv, glob
api, scsv = sys.argv[1], sys.argv[2]
MODELS = ["yc_fia_empirical_v1","yc_hybrid_v1","yc_treemap_spatial_v1"]
METRICS = ["agc_live_total","agb_dry","vol_stem","merch_vol_mcf","merch_bio_dry"]
PHI_OLD = {"harvest": 0.10, "intensive": 0.20, "conservation": 0.05}
VARIANTS = ["", ", disturbance-exposed", ", mortality-stressed"]
RES_DEFAULT = 0.042

sh = {}
for r in csv.DictReader(open(scsv)):
    sh[r["state"]] = (float(r["reserved_share"]), float(r["planted_share"]), float(r["harvested_share"]))

def phi_new(regime, planted, harvested):
    return planted if regime == "intensive" else harvested  # harvest & conservation -> harvested

def node(bl, model):
    for s in bl or []:
        if s.get("model") == model: return s
    return None

def rescale_state(path, st):
    res, planted, harvested = sh.get(st, (RES_DEFAULT, 0.0, 0.0))
    d = json.load(open(path)); touched = 0
    for met in METRICS:
        mm = d.get(met)
        if not mm: continue
        for model in MODELS:
            for regime, pold in PHI_OLD.items():
                phe_old = (1.0 - res) * pold
                if phe_old <= 0: continue
                ratio = phi_new(regime, planted, harvested) / phe_old
                for v in VARIANTS:
                    rn = node(mm.get(f"reserve (no harvest{v})"), model)
                    mn = node(mm.get(f"managed ({regime}{v})"), model)
                    if rn is None or mn is None: continue
                    rmap = {p[0]: p for p in rn["pts"]}
                    out = []
                    for p in mn["pts"]:
                        rp = rmap.get(p[0])
                        if rp is None: out.append(p); continue
                        out.append([p[0]] + [round(rp[i] + (p[i]-rp[i])*ratio, 3) for i in range(1, len(p))])
                    mn["pts"] = out; touched += 1
    if touched:
        json.dump(d, open(path, "w"), separators=(",", ":")); open(path, "a").write("\n")
    return touched

states = []
for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    st = os.path.basename(f)[:-5]
    if st == "US": continue
    if rescale_state(f, st): states.append(st)

# US managed buckets re-summed from rescaled states
usf = os.path.join(api, "series", "US.json"); us = json.load(open(usf))
sd = {st: json.load(open(os.path.join(api, "series", f"{st}.json"))) for st in states}
for met in METRICS:
    if met not in us: continue
    for model in MODELS:
        for regime in PHI_OLD:
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

print(f"data-driven managed fractions applied over {len(states)} states")
for met in ["agc_live_total"]:
    for bk in ["managed (harvest)","managed (conservation)","managed (intensive)"]:
        s = node(us[met].get(bk), "yc_fia_empirical_v1")
        if s:
            p = sorted(s["pts"]); print(f"  CONUS {bk:24s} {p[0][1]:.0f}->{p[-1][1]:.0f} ({100*(p[-1][1]/p[0][1]-1):+.0f}%)")
# a few states for sanity
for st in ["ME","GA","FL"]:
    d = json.load(open(os.path.join(api,"series",f"{st}.json")))
    out=[]
    for bk in ["reserve (no harvest)","managed (harvest)","managed (intensive)"]:
        s = node(d["agc_live_total"].get(bk), "yc_fia_empirical_v1")
        if s: p=sorted(s["pts"]); out.append(f"{bk.split('(')[1][:-1]}:{100*(p[-1][1]/p[0][1]-1):+.0f}%")
    print(f"  {st}: "+"  ".join(out))
