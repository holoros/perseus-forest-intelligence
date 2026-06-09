#!/usr/bin/env python3
"""PERSEUS API data-integrity check.

Scans public/api/series/*.json (+ meta.json) for structural corruption and
out-of-range model series. Report-only by default: it always exits 0 and emits
GitHub Actions ::warning:: annotations for issues, so it surfaces problems on
every push without blocking the active model pipeline. Pass --strict to exit 1
on STRUCTURAL corruption only (parse errors / NaN / Inf) — those should never
happen regardless of model-data iteration.

Usage:
  python3 scripts/check_api_integrity.py [api_dir] [--strict]
"""
from __future__ import annotations
import json, glob, math, os, sys

api = next((a for a in sys.argv[1:] if not a.startswith("-")), "public/api")
STRICT = "--strict" in sys.argv

# metrics whose state / US-rollup totals legitimately reach 1e4–1e6
LARGE_OK = {"vol_stem", "merch_vol_mcf", "merch_vol", "voltot_cuftac",
            "standing_value_musd", "agb_dry", "agc_live_total", "merch_bio_dry",
            "residue_bio_dry", "net_forest_hwp_c", "net_climate_carbon",
            "hwp_carbon_stock", "live_c_total", "tree_c_total"}
# net-carbon metrics that can legitimately be negative
NEG_OK = {"net_climate_carbon", "net_forest_hwp_c"}

def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

structural, ranges, retired = [], [], []
states = metrics = engines = pts = 0
y0, y1 = 9999, 0
metset, engset = set(), set()

for f in sorted(glob.glob(os.path.join(api, "series", "*.json"))):
    st = os.path.basename(f)[:-5]; states += 1
    try:
        o = json.load(open(f))
    except Exception as e:
        structural.append(f"{st}: JSON parse failure ({e})"); continue
    for m in o:
        metset.add(m)
        for bk in o[m]:
            for s in o[m][bk]:
                model = s.get("model", "?"); engset.add(model)
                p = s.get("pts", [])
                if not p:
                    structural.append(f"{st} · {m} · {model}: empty series")
                if "wear_nh" in model:
                    retired.append(f"{st} · {m} · {model}")
                for q in p:
                    pts += 1
                    if not q or len(q) < 2: continue
                    yr, v = q[0], q[1]
                    if num(yr): y0 = min(y0, yr); y1 = max(y1, yr)
                    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                        structural.append(f"{st} · {m} · {model}: NaN/Inf/null value")
                        continue
                    if not num(v): continue
                    if m == "rd_mean_wtd" and (v > 1.6 or v < 0):
                        ranges.append(f"{st} · {m} · {model}: {v:.3g} (expect 0–1.6)")
                    elif m == "sdi_mean_wtd" and v > 2500:
                        ranges.append(f"{st} · {m} · {model}: {v:.3g} (expect <2500)")
                    elif m == "es_bundle_score" and (v > 1.05 or v < 0):
                        ranges.append(f"{st} · {m} · {model}: {v:.3g} (expect 0–1)")
                    elif abs(v) > 1e7 and m not in LARGE_OK:
                        ranges.append(f"{st} · {m} · {model}: {v:.3g} (blow-up; metric not a large-total)")

metrics, engines = len(metset), len(engset)
# de-dup range/retired noise to one line per (state·metric·model)
ranges = sorted(set(ranges)); retired = sorted(set(retired))

def warn(msg):
    print(f"::warning::{msg}")

print("=== PERSEUS API integrity ===")
print(f"coverage: {states} states · {metrics} metrics · {engines} engines · "
      f"{pts} pts · years {y0}-{y1}")
if states < 45 or metrics < 40 or pts < 100000:
    warn(f"coverage looks low (states {states}, metrics {metrics}, pts {pts}) — "
         "possible incomplete refresh")

ok = True
if structural:
    ok = False
    print(f"\nSTRUCTURAL corruption ({len(structural)}):")
    for x in structural[:40]: print("  -", x); warn("structural: " + x)
if retired:
    ok = False
    print(f"\nretired wear_nh series still present ({len(retired)}) — "
          "front end hard-drops these, but the raw api is polluted; fix at the CEM export:")
    for x in retired[:40]: print("  -", x)
    warn(f"{len(retired)} retired wear_nh series present in api (corrupt; remove at source)")
if ranges:
    ok = False
    print(f"\nout-of-range values ({len(ranges)}):")
    for x in ranges[:40]: print("  -", x); warn("range: " + x)

if ok:
    print("\nPASS — no structural corruption, no retired series, all metric ranges sane.")
else:
    print("\nISSUES FOUND (see above). Report-only unless --strict; "
          "structural issues fail under --strict.")

# Exit policy: report-only by default; --strict fails ONLY on structural corruption
sys.exit(1 if (STRICT and structural) else 0)
