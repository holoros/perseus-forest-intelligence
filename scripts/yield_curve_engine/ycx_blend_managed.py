#!/usr/bin/env python3
"""ycx_blend_managed.py
Recalibrate the FIA managed scenarios from a whole-landscape rotation assumption to a
realistic partial-landscape one. The deployed managed buckets assumed every acre of an
owner is on active rotation, giving a removal ~100x the FIA-observed landscape average
(0.02 %/yr) and an implausible CONUS decline. Here each managed bucket is blended with
its matching reserve bucket using a per-regime active-management fraction phi:

    managed_new = phi * managed_rotation + (1 - phi) * reserve

so only fraction phi of the land base carries the modeled regime and (1-phi) tracks the
no-harvest trajectory. phi values are transparent, tunable active-management fractions
(reserve > conservation > harvest > intensive in remaining stock). Applied to the
yc_fia_empirical_v1 nodes of every stock metric, per management variant (base /
disturbance-exposed / mortality-stressed), for all states + US (blend is linear so the
US blend equals the sum of state blends).
Usage: python3 ycx_blend_managed.py <api_dir>
"""
import json, os, sys, glob
api = sys.argv[1]
MODEL = "yc_fia_empirical_v1"
METRICS = ["agc_live_total","agb_dry","vol_stem","merch_vol_mcf","merch_bio_dry"]
PHI = {"harvest": 0.10, "intensive": 0.20, "conservation": 0.05}
VARIANTS = ["", ", disturbance-exposed", ", mortality-stressed"]

def fia_pts(bucket_list):
    for s in bucket_list or []:
        if s.get("model") == MODEL:
            return s
    return None

def blend_file(path):
    d = json.load(open(path)); touched = 0
    for met in METRICS:
        mm = d.get(met)
        if not mm: continue
        for regime, phi in PHI.items():
            for v in VARIANTS:
                rbk = f"reserve (no harvest{v})"
                mbk = f"managed ({regime}{v})"
                rnode = fia_pts(mm.get(rbk)); mnode = fia_pts(mm.get(mbk))
                if rnode is None or mnode is None: continue
                rmap = {p[0]: p for p in rnode["pts"]}
                out = []
                for p in mnode["pts"]:
                    y = p[0]; rp = rmap.get(y)
                    if rp is None: out.append(p); continue
                    out.append([y] + [round(phi*p[i] + (1-phi)*rp[i], 3) for i in range(1, len(p))])
                mnode["pts"] = out; touched += 1
    if touched:
        json.dump(d, open(path, "w"), separators=(",", ":")); open(path, "a").write("\n")
    return touched

n = 0; tot = 0
for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    t = blend_file(f)
    if t: n += 1; tot += t
print(f"blended {tot} managed nodes across {n} series files; phi={PHI}")

# report CONUS managed-harvest carbon before/after sanity
u = json.load(open(os.path.join(api, "series", "US.json")))
for met in ["agc_live_total"]:
    for bk in ["reserve (no harvest)","managed (conservation)","managed (harvest)","managed (intensive)"]:
        s = fia_pts(u[met].get(bk))
        if s:
            p = sorted(s["pts"]); print(f"  {met} {bk:24s} {p[0][1]:.0f} -> {p[-1][1]:.0f} ({100*(p[-1][1]/p[0][1]-1):+.0f}%)")
