#!/usr/bin/env python3
"""Build public/api/agb_yield_curves_fia.json from the FIA remeasurement AGB
yield curve builds for the six Northern Forest states (ME, NH, VT, MI, WI, MN).

Inputs (paths given on the command line; nothing is read from a hard wired
location):
  --maine-xlsx  the Maine workbook (sheets Forms, Caps, Curves_5yr, Decline)
  --lakes-curves / --lakes-pick / --lakes-decline   Lake States CSVs (MI, WI, MN)
  --nhvt-curves  / --nhvt-pick  / --nhvt-decline    NH and VT CSVs
  --out          output JSON (default public/api/agb_yield_curves_fia.json)

The output keeps only the 5 year grid 0 to 250 yr (annual rows are dropped),
rounds values to 0.1 Mg ha-1, stores flags as 0/1 and arrays per cell, so the
six states fit in well under 1.5 MB. Aggregate curves only: no plot identifiers
or coordinates are read or written.

Usage:
  python3 scripts/build_agb_yield_curves.py \
    --maine-xlsx <workbook.xlsx> \
    --lakes-curves final_curves_capped_lakes_DATA.csv --lakes-pick pick_lakes_DATA.csv \
    --lakes-decline bootstrap_decline_lakes_DATA.csv \
    --nhvt-curves final_curves_capped_NHVT_long_DATA.csv --nhvt-pick pick_nhvt_DATA.csv \
    --nhvt-decline bootstrap_decline_nhvt_DATA.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import OrderedDict

AGES = list(range(0, 251, 5))
GENERATED = "2026-10-27"
TYPES = OrderedDict([
    ("SF", "Spruce-fir"),
    ("MBB", "Maple-beech-birch"),
    ("AB", "Aspen-birch"),
    ("OAK", "Oak (and oak-pine)"),
    ("EAC", "Elm-ash-cottonwood"),
    ("WRPH", "White-red pine-hemlock"),
])
# The Lake States build labels FIA type group 100 white-red-jack pine (jack pine
# is a major Lake States component); the Northeast builds label it white-red
# pine-hemlock. The group code is the same.
TYPE_LABEL_OVERRIDE = {st: {"WRPH": "White-red-jack pine"} for st in ("MI", "WI", "MN")}

METHOD = (
    "Generic aboveground live tree biomass yield curves fitted to FIA remeasurement "
    "intervals on single condition forested plots, by forest type group and USDA Forest "
    "Service ecological section, 0 to 250 yr. Curve: AGB(t) = min(cap, exp(mu_type + u_cell) "
    "x f(t)), where f is the chosen decline-capable form (CR, CRS, CRD or HG) under strategy "
    "S1 (remeasurement only, algebraic difference) or S2 (joint chronosequence plus repeated "
    "measures mixed model). Every curve is capped at the type's observed 99th percentile AGB; "
    "values beyond each cell's 99th percentile observed stand age are flagged as "
    "extrapolations. The 95% band is a plot cluster bootstrap confidence interval on the "
    "median curve (200 resamples, shape and level refit on each plot draw; draws failing "
    "the early rise screen are dropped). PI90 is a 90% prediction interval for a single "
    "plot. The median curve is the typical plot; the mean curve multiplies it by "
    "exp((s_plot^2 + s_res^2)/2) and is the right input for population totals. "
    "These are population curves: equivalence tests on annual net change fail the slope "
    "test for every candidate, so they do not predict plot level change."
)

SOURCES = {
    "ME": {"doi": "10.5281/zenodo.23406410",
           "label": "Maine FIA AGB yield curves v1.0.0 (Zenodo, published 2026-10-15)",
           "status": "deposited"},
    "MI": {"label": "Lake States FIA AGB yield curves, CRSF Cardinal build 2026-10-16", "status": "not yet deposited"},
    "WI": {"label": "Lake States FIA AGB yield curves, CRSF Cardinal build 2026-10-16", "status": "not yet deposited"},
    "MN": {"label": "Lake States FIA AGB yield curves, CRSF Cardinal build 2026-10-16", "status": "not yet deposited"},
    "NH": {"label": "NH and VT FIA AGB yield curves, CRSF Cardinal build 2026-10-16", "status": "not yet deposited"},
    "VT": {"label": "NH and VT FIA AGB yield curves, CRSF Cardinal build 2026-10-16", "status": "not yet deposited"},
}


def r1(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return round(f, 1)


def r3(v):
    if v is None or v == "":
        return None
    try:
        return round(float(v), 3)
    except (TypeError, ValueError):
        return None


def flag(v):
    return 1 if str(v).strip().upper() in ("TRUE", "1", "T", "YES") else 0


def intv(v):
    if v is None or str(v).strip() == "":
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def new_cell():
    return {"n_plots": None, "age_q99": None, "cap": None, "ages": list(AGES),
            "med": [], "mean": [], "lo95": [], "hi95": [], "pi90_lo": [], "pi90_hi": [],
            "capped": [], "extrap": []}


def push(cell, row_by_age):
    """row_by_age: age -> dict(med, mean, lo, hi, plo, phi, capped, extrap)."""
    for a in AGES:
        r = row_by_age.get(a)
        if r is None:
            raise SystemExit(f"missing age {a} in a cell; the 5 yr grid must be complete")
        cell["med"].append(r1(r["med"]))
        cell["mean"].append(r1(r["mean"]))
        cell["lo95"].append(r1(r["lo"]))
        cell["hi95"].append(r1(r["hi"]))
        cell["pi90_lo"].append(r1(r["plo"]))
        cell["pi90_hi"].append(r1(r["phi"]))
        cell["capped"].append(flag(r["capped"]))
        cell["extrap"].append(flag(r["extrap"]))


# ---------------------------------------------------------------- Maine (xlsx)
def load_maine(path):
    import openpyxl  # stdlib + openpyxl only
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = lambda name: list(wb[name].iter_rows(values_only=True))
    forms = {r[0]: {"strat": r[2], "form": r[3], "basis": r[4]} for r in rows("Forms")[1:] if r[0]}
    caps = {r[0]: {"cap": r1(r[2]), "age_q99": r1(r[4])} for r in rows("Caps")[1:] if r[0]}
    decline = {}
    for r in rows("Decline")[1:]:
        if not r[0]:
            continue
        decline[r[0]] = {"p_decline_250": r3(r[2]), "peak_q50": r1(r[4]), "r250_q50": r3(r[7]),
                         "nboot": intv(r[1]), "dropped_early": (200 - intv(r[1])) if intv(r[1]) is not None else None}
    cells = {}
    for r in rows("Curves_5yr")[1:]:
        if not r[0]:
            continue
        t, sec, age = r[0], r[1], int(r[2])
        key = (sec, t)
        c = cells.setdefault(key, {"n_plots": intv(r[11]), "rows": {}})
        c["rows"][age] = {"med": r[3], "mean": r[4], "lo": r[5], "hi": r[6], "plo": r[7], "phi": r[8],
                          "capped": r[9], "extrap": r[10]}
    sections = OrderedDict()
    for (sec, t), c in sorted(cells.items(), key=lambda kv: (kv[0][0] != "ALL", kv[0][0], kv[0][1])):
        cell = new_cell()
        cell["n_plots"] = c["n_plots"]
        cell["cap"] = caps.get(t, {}).get("cap")
        # The workbook gives the 99th percentile stand age per type (Caps sheet), not per
        # cell. It is carried on the statewide (ALL) curve only; section cells keep null and
        # the extrapolation flags show where each section's own 99th percentile age falls.
        cell["age_q99"] = caps.get(t, {}).get("age_q99") if sec == "ALL" else None
        push(cell, c["rows"])
        sections.setdefault(sec, {"types": OrderedDict()})["types"][t] = cell
    picks = {t: forms[t] for t in TYPES if t in forms}
    return {"sections": sections, "picks": picks, "decline": decline}


# ---------------------------------------------------------------- CSV builds
def load_curves_csv(path, state_col):
    cells = {}
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            age = float(r["age"])
            if age != int(age) or int(age) % 5:
                continue  # 5 yr grid only
            age = int(age)
            st = r[state_col]
            key = (st, r["section"], r["ftg"])
            c = cells.setdefault(key, {"n_plots": intv(r["n_plots"]), "age_q99": r1(r["age_q99"]),
                                       "cap": r1(r["cap"]), "strat": r["strat"], "form": r["form"],
                                       "basis": r["basis"], "rows": {}})
            c["rows"][age] = {"med": r["AGB_med"], "mean": r["AGB_mean"], "lo": r["lo95"], "hi": r["hi95"],
                              "plo": r["PI90_lo"], "phi": r["PI90_hi"], "capped": r["capped"],
                              "extrap": r["extrapolated"]}
    out = {}
    for (st, sec, t), c in sorted(cells.items(), key=lambda kv: (kv[0][0], kv[0][1] != "ALL", kv[0][1], kv[0][2])):
        cell = new_cell()
        cell["n_plots"] = c["n_plots"]
        cell["age_q99"] = c["age_q99"]
        cell["cap"] = c["cap"]
        push(cell, c["rows"])
        stn = out.setdefault(st, {"sections": OrderedDict(), "basis": {}})
        stn["sections"].setdefault(sec, {"types": OrderedDict()})["types"][t] = cell
        # basis string as the curves file carries it on the statewide row
        if sec == "ALL":
            stn["basis"][t] = c["basis"]
    return out


def load_pick_csv(path):
    picks = {}
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            st = r.get("state") or "POOLED"
            picks.setdefault(st, {})[r["ftg"]] = {"strat": r["strat"], "form": r["form"], "basis": r["basis"]}
    return picks


def load_decline_csv(path):
    dec = {}
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            st = r.get("state") or "POOLED"
            dec.setdefault(st, {})[r["ftg"]] = {
                "p_decline_250": r3(r["p_decline_250"]), "peak_q50": r1(r["peak_q50"]),
                "r250_q50": r3(r["r250_q50"]), "nboot": intv(r["nboot"]), "dropped_early": intv(r["dropped_early"])}
    return dec


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--maine-xlsx", required=True)
    ap.add_argument("--lakes-curves", required=True)
    ap.add_argument("--lakes-pick", required=True)
    ap.add_argument("--lakes-decline", required=True)
    ap.add_argument("--nhvt-curves", required=True)
    ap.add_argument("--nhvt-pick", required=True)
    ap.add_argument("--nhvt-decline", required=True)
    ap.add_argument("--out", default=os.path.join("public", "api", "agb_yield_curves_fia.json"))
    a = ap.parse_args()

    states = OrderedDict()
    notes = []

    me = load_maine(a.maine_xlsx)
    states["ME"] = {"sections": me["sections"], "picks": me["picks"], "decline": me["decline"]}
    notes.append("ME: curves from the Maine workbook Curves_5yr sheet (section ALL is the statewide "
                 "curve). cap and age_q99 come from the Caps sheet, which gives them per type; "
                 "age_q99 is carried on the ALL curve only and is null for section cells, whose "
                 "extrapolation flags mark the cell's own 99th percentile age. dropped_early for ME "
                 "is 200 minus the surviving bootstrap draws.")

    lakes = load_curves_csv(a.lakes_curves, "state")
    lpick = load_pick_csv(a.lakes_pick)
    ldec = load_decline_csv(a.lakes_decline)
    for st in ("MI", "WI", "MN"):
        node = lakes[st]
        picks = OrderedDict()
        for t in TYPES:
            if t not in node["basis"]:
                continue
            p = dict(lpick.get(st, {}).get(t) or {})
            if st == "MN" and t in ("MBB", "OAK"):
                # The MN rows in the curves file for MBB and OAK are the Lake States pooled fit
                # (basis column says so). pick_lakes_DATA.csv carries both the rejected MN state
                # fit (S1 CRS and S1 HG under the Maine step 3 fallback) and the LSPOOL pick
                # (S1 HG). The LSPOOL pick is what the curves use, so it is what we carry.
                p = dict(lpick["LSPOOL"][t])
                p["pooled"] = "LSPOOL"
            p["basis"] = node["basis"][t]
            picks[t] = p
        decline = OrderedDict()
        for t in TYPES:
            d = ldec.get(st, {}).get(t)
            if st == "MN" and t == "MBB" and "LSPOOL" in ldec and t in ldec["LSPOOL"]:
                d = dict(ldec["LSPOOL"][t]); d["pooled"] = "LSPOOL"
            elif st == "MN" and t == "OAK":
                # bootstrap_decline_lakes_DATA.csv has no LSPOOL OAK row; the MN row there is
                # the rejected state fit (77 of 200 draws), so no decline summary is carried.
                d = None
            if d:
                decline[t] = d
        states[st] = {"sections": node["sections"], "picks": picks, "decline": decline}
    notes.append("MI, WI, MN: curves from final_curves_capped_lakes_DATA.csv (section ALL is the "
                 "statewide curve). MN maple-beech-birch and oak rows in that file are the Lake "
                 "States pooled fit (LSPOOL, S1 HG), limited to MN cells and re-capped at the MN "
                 "99th percentile AGB; the MN state fits for those two types failed the early rise "
                 "screen and were rejected. Their picks carry pooled: 'LSPOOL'. The pooled "
                 "bootstrap decline summary exists for MBB only (119 of 200 draws); none is carried "
                 "for MN oak. Lake States label type group 100 white-red-jack pine (type_labels).")

    nhvt = load_curves_csv(a.nhvt_curves, "st")
    npick = load_pick_csv(a.nhvt_pick)["POOLED"]
    ndec = load_decline_csv(a.nhvt_decline)["POOLED"]
    for st in ("NH", "VT"):
        node = nhvt[st]
        picks = OrderedDict((t, dict(npick[t], pooled="NHVT")) for t in TYPES if t in npick and t in node["basis"])
        decline = OrderedDict((t, dict(ndec[t], pooled="NHVT")) for t in TYPES if t in ndec and t in node["basis"])
        states[st] = {"sections": node["sections"], "picks": picks, "decline": decline}
    notes.append("NH, VT: curves from final_curves_capped_NHVT_long_DATA.csv (section ALL is the "
                 "state curve). Shapes were fitted on NH and VT pooled with a state level effect "
                 "(NH about 5% above VT), so the pick and bootstrap decline tables are shared by "
                 "both states (pooled: 'NHVT'). Elm-ash-cottonwood (16 pooled plots) was dropped "
                 "under the 50 plot thin rule and has no NH or VT curve. Oak: every candidate "
                 "failed the 99.9th percentile magnitude screen; the curve is held at the type cap.")

    out = OrderedDict([
        ("schema", "perseus_agb_yield_curves_v1"),
        ("generated", GENERATED),
        ("unit", "Mg ha-1 (aboveground live tree biomass, FIADB DRYBIO_AG basis)"),
        ("method", METHOD),
        ("types", dict(TYPES)),
        ("type_labels", TYPE_LABEL_OVERRIDE),
        ("sources", SOURCES),
        ("notes", notes),
        ("states", states),
    ])
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"), allow_nan=False)
    size = os.path.getsize(a.out)
    ncell = sum(len(s["types"]) for st in states.values() for s in st["sections"].values())
    print(f"wrote {a.out}: {size/1e6:.2f} MB, {len(states)} states, {ncell} cells")
    return 0


if __name__ == "__main__":
    sys.exit(main())
