#!/usr/bin/env python3
"""
ycx_merge_perseus.py

Inject the empirical yield-curve engine (cls "YC") into the PERSEUS
api/series JSON for the pilot states (ME, IN, GA).

The yield curves give a per-hectare carbon-density trajectory under two
scenarios (reserve = untreated curve, managed = anchored harvested
curve), with a +/-10% climate-productivity ribbon. PERSEUS metrics are
state totals in Tg C, so we anchor the trajectory SHAPE to the state's
FIA above-ground live carbon total (fia.json tg_agc):

  reserve_total(t) = tg_agc * reserve(t) / reserve(2025)
  managed_total(t) = tg_agc * (reserve(2025) + managed(t) - managed(2025))
                            / reserve(2025)

Both scenarios start at the observed FIA stock in 2025 and diverge by
their forward increments (reserve accumulates more carbon than managed).
Unit-conversion constants cancel in the ratio, so only the curve shape
and the FIA anchor matter.

Usage: python3 ycx_merge_perseus.py <repo_dir> <series_csv_dir> [ST ...]
"""
import csv, json, sys, os
from collections import defaultdict

repo   = sys.argv[1]
csvdir = sys.argv[2]
states = sys.argv[3:] or ["ME", "IN", "GA"]

api    = os.path.join(repo, "public", "api")
fia    = json.load(open(os.path.join(api, "fia.json")))
META   = json.load(open(os.path.join(api, "meta.json")))
STJSON = os.path.join(api, "states.json")
stmeta = json.load(open(STJSON))

MODEL  = "yc_fia_empirical_v1"
CLS    = "YC"
START  = 2025
SCEN_BUCKET = {"reserve (no harvest)": "reserve (no harvest)",
               "managed (harvest)":    "managed (harvest)"}

def load_native(st):
    """ -> native[metric][mgmt][year] = (value, lo, hi) """
    f = os.path.join(csvdir, f"ycx_{st}_state_series.csv")
    out = defaultdict(lambda: defaultdict(dict))
    with open(f) as fh:
        for r in csv.DictReader(fh):
            out[r["metric"]][r["mgmt"]][int(r["year"])] = (
                float(r["value"]), float(r["value_lo"]), float(r["value_hi"]))
    return out

added_engines = 0
for st in states:
    spath = os.path.join(api, "series", f"{st}.json")
    ser   = json.load(open(spath))
    nat   = load_native(st)
    tg    = fia.get(st, {}).get("tg_agc")
    if tg is None:
        print(f"  {st}: no FIA tg_agc anchor; skipping"); continue

    metric = "agc_live_total"
    res = nat[metric]["reserve (no harvest)"]
    man = nat[metric]["managed (harvest)"]
    years = sorted(res)
    d0 = res[START][0]            # shared baseline density (current stock)
    m0 = man[START][0]

    def build(scen):
        pts = []
        for y in years:
            if scen == "reserve (no harvest)":
                v, lo, hi = res[y]
                tv = tg * v  / d0; tlo = tg * lo / d0; thi = tg * hi / d0
            else:
                v, lo, hi = man[y]
                tv  = tg * (d0 + v  - m0) / d0
                tlo = tg * (d0 + lo - m0) / d0
                thi = tg * (d0 + hi - m0) / d0
            pts.append([y, round(tv, 2), round(tlo, 2), round(thi, 2)])
        return pts

    for bucket in ("reserve (no harvest)", "managed (harvest)"):
        node = ser.setdefault(metric, {}).setdefault(bucket, [])
        # remove any prior YC engine (idempotent re-runs)
        node[:] = [s for s in node if s.get("model") != MODEL]
        node.append({
            "model": MODEL, "cls": CLS,
            "label": ("YC empirical yield curve (FIA chronosequence, "
                      "EPA-L3 x ownership strata; FIA-anchored, climate +/-10%)"),
            "pts": build(bucket)})

    json.dump(ser, open(spath, "w"), separators=(",", ":"))
    added_engines += 1

    # states.json: +1 engine, ensure metric listed
    sm = stmeta.get(st)
    if sm:
        sm["engines"] = sm.get("engines", 0) + 1
        sm["rows"]    = sm.get("rows", 0) + 2 * len(years)
        if "series_metrics" in sm and metric not in sm["series_metrics"]:
            sm["series_metrics"] = sorted(sm["series_metrics"] + [metric])
    r2025 = tg
    r2075 = round(tg * res[2075][0] / d0, 1)
    m2075 = round(tg * (d0 + man[2075][0] - m0) / d0, 1)
    print(f"  {st}: anchored tg_agc={tg}  reserve 2025->2075 {r2025}->{r2075} Tg | "
          f"managed 2075 {m2075} Tg | forgone {round(r2075-m2075,1)} Tg")

json.dump(stmeta, open(STJSON, "w"), separators=(",", ":"))
META["stats"]["engines"] = META["stats"].get("engines", 0) + 1
json.dump(META, open(os.path.join(api, "meta.json"), "w"), separators=(",", ":"))
print(f"Done: YC engine added to {added_engines} states; meta engines bumped.")
