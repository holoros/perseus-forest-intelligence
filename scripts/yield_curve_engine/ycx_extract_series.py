#!/usr/bin/env python3
"""
ycx_extract_series.py
Extract the two yield-curve area-expansion engines (FIADB uniform-grid and
TreeMap pixel-area) from the PERSEUS api/series JSON into a tidy long CSV for
the R comparison, plus the FIA observed anchors. Dependency-free (stdlib only).

Usage: python3 ycx_extract_series.py <api_dir> <out_csv_dir>
"""
import csv, json, os, sys, glob
api, outd = sys.argv[1], sys.argv[2]
os.makedirs(outd, exist_ok=True)
METRIC, BUCKET = "agc_live_total", "reserve (no harvest)"
MODELS = {"yc_fia_empirical_v1": "FIADB", "yc_treemap_spatial_v1": "TreeMap"}

rows = []
for f in sorted(glob.glob(os.path.join(api, "series", "[A-Z][A-Z].json"))):
    st = os.path.basename(f)[:2]
    d = json.load(open(f))
    node = d.get(METRIC, {}).get(BUCKET, [])
    for e in node:
        tag = MODELS.get(e.get("model"))
        if not tag:
            continue
        for p in e["pts"]:
            rows.append([st, tag, p[0], p[1]])
with open(os.path.join(outd, "series_long.csv"), "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["state", "expansion", "year", "val"]); w.writerows(rows)

fia = json.load(open(os.path.join(api, "fia.json")))
with open(os.path.join(outd, "fia_obs.csv"), "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["state", "tg_agc", "year"])
    for st, v in fia.items():
        w.writerow([st, v.get("tg_agc"), v.get("year")])
print(f"wrote series_long.csv ({len(rows)} rows) and fia_obs.csv to {outd}")
