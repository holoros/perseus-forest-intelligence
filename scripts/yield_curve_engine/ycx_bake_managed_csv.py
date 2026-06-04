#!/usr/bin/env python3
"""ycx_bake_managed_csv.py
Bake the FIADB-derived data-driven managed trajectories directly into the FIA fullseries
CSVs (the canonical input the dashboard ingest reads), so the managed buckets are correct
at the source and survive any re-injection.

For every managed bucket row, replace value/lo/hi with
    phi * full_rotation + (1 - phi) * reserve_match
where phi is the FIADB per-state working fraction (harvested_share for harvest and
conservation, planted_share for intensive; reserved land excluded by construction) and
reserve_match is the matching reserve bucket (base / disturbance-exposed / mortality-
stressed) for the same state and year. Reserve rows are untouched.

The CSVs are the projector output; run this once after each projector run (the projector
emits whole-landscape rotation, which is unrealistic). Backs up the original to *.full.csv.
Usage: python3 ycx_bake_managed_csv.py <shares_csv> <fullseries_csv> [<fullseries_csv> ...]
"""
import csv, sys, os, shutil

shares_path = sys.argv[1]
files = sys.argv[2:]
sh = {r["state"]: (float(r["planted_share"]), float(r["harvested_share"]))
      for r in csv.DictReader(open(shares_path))}

RESERVE_MATCH = {
 "managed (harvest)":                         "reserve (no harvest)",
 "managed (harvest, disturbance-exposed)":    "reserve (no harvest, disturbance-exposed)",
 "managed (harvest, mortality-stressed)":     "reserve (no harvest, mortality-stressed)",
 "managed (intensive)":                       "reserve (no harvest)",
 "managed (intensive, disturbance-exposed)":  "reserve (no harvest, disturbance-exposed)",
 "managed (intensive, mortality-stressed)":   "reserve (no harvest, mortality-stressed)",
 "managed (conservation)":                    "reserve (no harvest)",
 "managed (conservation, disturbance-exposed)":"reserve (no harvest, disturbance-exposed)",
 "managed (conservation, mortality-stressed)": "reserve (no harvest, mortality-stressed)",
}
def regime(scn):
    if "intensive" in scn: return "intensive"
    if "conservation" in scn: return "conservation"
    return "harvest"

for fp in files:
    rows = list(csv.DictReader(open(fp)))
    fields = rows[0].keys()
    idx = {(r["state"], r["scenario"], r["year"]): r for r in rows}
    n = 0
    for r in rows:
        scn = r["scenario"]
        if scn not in RESERVE_MATCH: continue
        st = r["state"]; planted, harvested = sh.get(st, (0.0, 0.0))
        phi = planted if regime(scn) == "intensive" else harvested
        rr = idx.get((st, RESERVE_MATCH[scn], r["year"]))
        if rr is None: continue
        for comp in ("value", "lo", "hi"):
            full = float(r[comp]); res = float(rr[comp])
            r[comp] = round(phi*full + (1.0-phi)*res, 4)
        n += 1
    bak = fp[:-4] + ".full.csv"
    if not os.path.exists(bak): shutil.copy(fp, bak)
    with open(fp, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(fields)); w.writeheader(); w.writerows(rows)
    print(f"baked {n} managed rows in {os.path.basename(fp)} (backup {os.path.basename(bak)})")
