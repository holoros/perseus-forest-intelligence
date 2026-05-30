#!/usr/bin/env python3
"""
ycx_merge_perseus.py  (v2 — all CONUS states, 3 metrics, harvest removals)

Inject the empirical yield-curve engine (cls "YC") into the PERSEUS
api/series JSON for every state with a ycx_<ST>_state_series.csv.

Metrics: agc_live_total (Tg C), agb_dry (Tg dry biomass), vol_stem (Mm3).
Scenarios: reserve (no harvest) and managed (harvest, owner-rotation
clearcut with real removals). Climate +/-10% ribbon -> pts [yr,mean,lo,hi].

State totals from per-hectare densities use the uniform-grid area model:
  area_ha   = n_forest_plots * A0
  total_Tg  = mean_density * area_ha / 1e6
A0 (ha per current ground plot) is calibrated so AG-carbon totals
reproduce the FIA anchors in fia.json (tg_agc) for the 11 states that
have them; the median A0 is used for the remaining states.

Usage: python3 ycx_merge_perseus.py <repo_dir> <series_csv_dir>
"""
import csv, json, sys, os, glob, statistics
from collections import defaultdict

repo, csvdir = sys.argv[1], sys.argv[2]
api  = os.path.join(repo, "public", "api")
fia  = json.load(open(os.path.join(api, "fia.json")))
META = json.load(open(os.path.join(api, "meta.json")))
stmeta = json.load(open(os.path.join(api, "states.json")))

MODEL, CLS, START = "yc_fia_empirical_v1", "YC", 2025
METRICS = ["agc_live_total", "agb_dry", "vol_stem"]   # Tg, Tg, Mm3
BUCKETS = ["reserve (no harvest)", "managed (harvest)"]

# FIPS-abbr -> (name, [lon, lat]) for CONUS states we may add
ST_INFO = {
 "AL":("Alabama",[-86.8,32.8]),"AZ":("Arizona",[-111.7,34.3]),"AR":("Arkansas",[-92.4,34.8]),
 "CA":("California",[-119.7,37.2]),"CO":("Colorado",[-105.5,39.0]),"CT":("Connecticut",[-72.7,41.6]),
 "DE":("Delaware",[-75.5,39.0]),"FL":("Florida",[-81.7,28.6]),"GA":("Georgia",[-83.4,32.6]),
 "ID":("Idaho",[-114.5,44.4]),"IL":("Illinois",[-89.2,40.0]),"IN":("Indiana",[-86.3,39.9]),
 "IA":("Iowa",[-93.5,42.0]),"KS":("Kansas",[-98.3,38.5]),"KY":("Kentucky",[-85.3,37.5]),
 "LA":("Louisiana",[-92.0,31.0]),"ME":("Maine",[-69.2,45.4]),"MD":("Maryland",[-76.8,39.0]),
 "MA":("Massachusetts",[-71.8,42.3]),"MI":("Michigan",[-85.0,44.3]),"MN":("Minnesota",[-94.3,46.3]),
 "MS":("Mississippi",[-89.7,32.7]),"MO":("Missouri",[-92.5,38.4]),"MT":("Montana",[-109.6,47.0]),
 "NE":("Nebraska",[-99.8,41.5]),"NV":("Nevada",[-116.9,39.3]),"NH":("New Hampshire",[-71.6,43.7]),
 "NJ":("New Jersey",[-74.7,40.1]),"NM":("New Mexico",[-106.1,34.4]),"NY":("New York",[-75.5,42.9]),
 "NC":("North Carolina",[-79.4,35.5]),"ND":("North Dakota",[-100.5,47.4]),"OH":("Ohio",[-82.8,40.3]),
 "OK":("Oklahoma",[-97.5,35.6]),"OR":("Oregon",[-120.6,43.9]),"PA":("Pennsylvania",[-77.8,41.0]),
 "RI":("Rhode Island",[-71.5,41.7]),"SC":("South Carolina",[-80.9,33.9]),"SD":("South Dakota",[-100.2,44.4]),
 "TN":("Tennessee",[-86.4,35.8]),"TX":("Texas",[-99.3,31.5]),"UT":("Utah",[-111.7,39.3]),
 "VT":("Vermont",[-72.7,44.0]),"VA":("Virginia",[-78.8,37.5]),"WA":("Washington",[-120.4,47.4]),
 "WV":("West Virginia",[-80.6,38.9]),"WI":("Wisconsin",[-89.9,44.6]),"WY":("Wyoming",[-107.5,43.0]),
}

def load_native(path):
    d = defaultdict(lambda: defaultdict(dict)); npl = 0
    for r in csv.DictReader(open(path)):
        d[r["metric"]][r["mgmt"]][int(r["year"])] = (
            float(r["value"]), float(r["value_lo"]), float(r["value_hi"]))
        npl = max(npl, int(r["n_plots"]))
    return d, npl

# ---- gather all state CSVs ----
files = sorted(glob.glob(os.path.join(csvdir, "ycx_*_state_series.csv")))
native, nplots = {}, {}
for f in files:
    st = os.path.basename(f).split("_")[1]
    native[st], nplots[st] = load_native(f)

# ---- calibrate A0 (ha per plot) from FIA carbon anchors ----
A0 = {}
for st in native:
    tg = fia.get(st, {}).get("tg_agc")
    if tg is None: continue
    d25 = native[st]["agc_live_total"]["reserve (no harvest)"][START][0]  # MgC/ha
    npl = nplots[st]
    if d25 > 0 and npl > 0:
        A0[st] = tg * 1e6 / (d25 * npl)
A0_med = statistics.median(A0.values())
print(f"A0 calibrated on {len(A0)} FIA-anchored states; "
      f"median = {A0_med:.0f} ha/plot (range {min(A0.values()):.0f}-{max(A0.values()):.0f})")

def area_ha(st):
    return nplots[st] * A0.get(st, A0_med)

# ---- build + inject ----
added_states = []
for st in sorted(native):
    spath = os.path.join(api, "series", f"{st}.json")
    ser = json.load(open(spath)) if os.path.exists(spath) else {}
    A = area_ha(st)
    added_pts = 0
    for metric in METRICS:
        if metric not in native[st]:
            continue
        for bucket in BUCKETS:
            nb = native[st][metric][bucket]
            pts = []
            for y in sorted(nb):
                v, lo, hi = nb[y]
                pts.append([y, round(v*A/1e6, 3), round(lo*A/1e6, 3), round(hi*A/1e6, 3)])
            node = ser.setdefault(metric, {}).setdefault(bucket, [])
            node[:] = [s for s in node if s.get("model") != MODEL]
            node.append({"model": MODEL, "cls": CLS,
                "label": ("YC empirical yield curve (FIA chronosequence, "
                          "EPA-L3 x ownership strata; owner-rotation harvest, "
                          "FIA-anchored area, climate +/-10%)"),
                "pts": pts})
            added_pts += len(pts)
    json.dump(ser, open(spath, "w"), separators=(",", ":"))

    sm = stmeta.get(st)
    if sm:                              # existing state
        sm["engines"] = sm.get("engines", 0) + 1
        sm["rows"]    = sm.get("rows", 0) + added_pts
        smk = set(sm.get("series_metrics", []))
        sm["series_metrics"] = sorted(smk | set(METRICS))
        sm["has_series"] = True
    else:                               # new state
        name, cen = ST_INFO.get(st, (st, [-98.0, 39.0]))
        stmeta[st] = {"engines": 1, "metrics": len(METRICS), "rows": added_pts,
                      "name": name, "centroid": cen, "has_series": True,
                      "has_tier_b": False, "series_metrics": sorted(METRICS)}
        added_states.append(st)

# US aggregate stays as-is; refresh meta stats
json.dump(stmeta, open(os.path.join(api, "states.json"), "w"),
          indent=1, ensure_ascii=False); open(os.path.join(api,"states.json"),"a").write("\n")
real_states = [k for k in stmeta if k != "US"]
META["stats"]["states"]  = len(real_states)
META["stats"]["engines"] = META["stats"].get("engines", 0) + 1
json.dump(META, open(os.path.join(api, "meta.json"), "w"),
          indent=1, ensure_ascii=False); open(os.path.join(api,"meta.json"),"a").write("\n")

print(f"Injected YC into {len(native)} states ({len(added_states)} new: "
      f"{', '.join(added_states)})")
# print a few anchored checks
for st in ["ME","IN","GA","CA","TX","MN"]:
    if st in native:
        A = area_ha(st)
        r = native[st]["agc_live_total"]["reserve (no harvest)"]
        m = native[st]["agc_live_total"]["managed (harvest)"]
        print(f"  {st}: AGC reserve {round(r[2025][0]*A/1e6,1)}->{round(r[2075][0]*A/1e6,1)} Tg | "
              f"managed {round(m[2025][0]*A/1e6,1)}->{round(m[2075][0]*A/1e6,1)} Tg "
              f"| A0={A0.get(st,A0_med):.0f} npl={nplots[st]}")
