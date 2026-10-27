#!/usr/bin/env python3
"""Build public/api/rd_thresholds_l3.json from Supplementary Data S1 of
Chivhenge, Weiskittel, Ray, Woodall, D'Amato and Daigneault, "Evaluating relative
density-stand dynamics relationships across contrasting forest types of the
conterminous United States" (submitted to Forest Ecology and Management; archive
concept DOI 10.5281/zenodo.23397937; Supplementary Data S1 is unchanged across
versions).

Per EPA Level III ecoregion and FIA forest type, the breakpoints in projected
relative density (RD) for gross growth (G), net growth (N), mortality incidence
(inc) and mortality severity (sev), each with its 95% interval and a source code:
  fp  cell fitted and pooled
  fx  cell fitted, excluded (edge or few replicates)
  po  pooled only (thin cell)

State to ecoregion lookup (state_l3). None of the repo's ecoregion products
(hrr_ecoregion, ecoregion_harvest_summary, landowner_by_ecoregion, the L3
geojson) carries a state list, so it is computed here: each L3 feature in
public/geo/us_eco_l3_features.geojson is sampled on a regular grid inside its
bounding box (points kept when inside the polygon, ring vertices added for very
small parts) and every sample point is located in public/geo/us-states.geojson by
pure Python ray casting. A state is listed for an ecoregion when at least
MIN_HITS of its sample points fall in that state, which drops single points that
land across a simplified border. The geojson uses North American L3 codes
(NA_L3CODE, e.g. 7.1.8) and names; it is matched to the US L3 numbers of the
CSV by ecoregion name, with the ten NA-to-US name differences listed in
NAME_ALIAS.

Stdlib only. Usage:
  python3 scripts/build_rd_thresholds.py <SupplementaryDataS1.csv> \
      [--l3-geo public/geo/us_eco_l3_features.geojson] [--states-geo public/geo/us-states.geojson] \
      [--out public/api/rd_thresholds_l3.json]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from collections import OrderedDict, defaultdict

GENERATED = "2026-10-27"
MIN_HITS = 3          # sample points of an ecoregion that must fall in a state
GRID_TARGET = 400     # sample points per polygon part (upper bound, bbox grid)

SRC_CODE = {
    "cell fitted and pooled": "fp",
    "cell fitted, excluded (edge or few replicates)": "fx",
    "pooled only (thin cell)": "po",
}
SOURCE_CODES = OrderedDict([
    ("fp", "cell fitted and pooled: the cell had its own fit and it entered the pooled estimate"),
    ("fx", "cell fitted, excluded: the cell had its own fit but it was excluded from pooling (edge or few replicates)"),
    ("po", "pooled only: thin cell, the value is the pooled type by ecoregion estimate"),
])

# North American L3 names in the geojson -> US EPA L3 names in Supplementary Data S1.
NAME_ALIAS = {
    "Strait of Georgia/Puget Lowland": "Puget Lowland",
    "California Coastal Sage, Chaparral, and Oak Woodlands": "Central California Foothills and Coastal Mountains",
    "Southern and Baja California Pine-Oak Mountains": "Southern California Mountains",
    "Columbia Mountains/Northern Rockies": "Northern Rockies",
    "Southern Texas Plains/Interior Plains and Hills with Xerophytic Shrub and Oak Forest": "Southern Texas Plains",
    "Aspen Parkland/Northern Glaciated Plains": "Northern Glaciated Plains",
    "Lake Manitoba and Lake Agassiz Plain": "Lake Agassiz Plain",
    "Northern Appalachian and Atlantic Maritime Highlands": "Northeastern Highlands",
    "Klamath Mountains": "Klamath Mountains/California High North Coast Range",
    "Sonoran Desert": "Sonoran Basin and Range",
}

NATIONAL = OrderedDict([
    ("note", "Headline national breakpoints in projected RD (all types pooled), and the pooled "
             "type by ecoregion cell means with 95% prediction intervals for a new cell."),
    ("gross_growth", 0.42),
    ("net_growth", 0.34),
    ("net_growth_profile_interval", [0.33, 0.36]),
    ("mortality_incidence", 0.45),
    ("mortality_severity", 0.50),
    ("pooled_cells", OrderedDict([
        ("gross", OrderedDict([("mean", 0.443), ("n_cells", 285), ("pi95_new_cell", [0.37, 0.52])])),
        ("net", OrderedDict([("mean", 0.447), ("n_cells", 265), ("pi95_new_cell", [0.35, 0.55])])),
    ])),
])

SOURCE = OrderedDict([
    ("citation", "Chivhenge, E., Weiskittel, A. R., Ray, D., Woodall, C. W., D'Amato, A. W. and Daigneault, A. "
                 "Evaluating relative density-stand dynamics relationships across contrasting forest types "
                 "of the conterminous United States. Submitted to Forest Ecology and Management."),
    ("doi", "10.5281/zenodo.23397937"),
    ("doi_note", "Concept DOI; Supplementary Data S1 is unchanged across versions."),
    ("file", "rdgrowth_thresholds_foresttype_ecoregion_SupplementaryDataS1.csv"),
    ("rd_definition", "Breakpoints are in projected relative density (RD)."),
])


def r3(v):
    if v is None or str(v).strip() in ("", "NA"):
        return None
    return round(float(v), 3)


# ------------------------------------------------------------ geometry helpers
def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def pip(x, y, ring):
    """Ray casting point in ring (list of [x, y])."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            xint = (xj - xi) * (y - yi) / ((yj - yi) or 1e-300) + xi
            if x < xint:
                inside = not inside
        j = i
    return inside


def in_polygon(x, y, poly):
    """poly = [outer, hole, hole...]"""
    if not pip(x, y, poly[0]):
        return False
    for hole in poly[1:]:
        if pip(x, y, hole):
            return False
    return True


def bbox(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def sample_polygon(poly):
    """Grid samples inside the polygon part; vertices as a fallback for slivers."""
    x0, y0, x1, y1 = bbox(poly[0])
    w, h = x1 - x0, y1 - y0
    pts = []
    if w > 0 and h > 0:
        step = math.sqrt((w * h) / GRID_TARGET)
        step = max(step, 0.02)  # about 2 km; finer is pointless on simplified polygons
        nx, ny = int(w / step) + 1, int(h / step) + 1
        for i in range(nx):
            x = x0 + (i + 0.5) * step
            for k in range(ny):
                y = y0 + (k + 0.5) * step
                if in_polygon(x, y, poly):
                    pts.append((x, y))
    if len(pts) < MIN_HITS:
        pts.extend((p[0], p[1]) for p in poly[0][:-1])
    return pts


class StateIndex:
    def __init__(self, states_geo):
        self.parts = []  # (bbox, poly, state)
        for f in states_geo["features"]:
            st = f["properties"].get("state") or f["properties"].get("STUSPS")
            for poly in rings_of(f["geometry"]):
                self.parts.append((bbox(poly[0]), poly, st))

    def locate(self, x, y):
        for (bx0, by0, bx1, by1), poly, st in self.parts:
            if bx0 <= x <= bx1 and by0 <= y <= by1 and in_polygon(x, y, poly):
                return st
        return None


def build_state_l3(l3_geo, states_geo, name_to_code):
    idx = StateIndex(states_geo)
    hits = defaultdict(lambda: defaultdict(int))
    unmatched = set()
    for f in l3_geo["features"]:
        nm = f["properties"].get("NA_L3NAME") or f["properties"].get("US_L3NAME")
        nm = NAME_ALIAS.get(nm, nm)
        code = name_to_code.get(nm)
        if code is None:
            unmatched.add(nm)
            continue
        for poly in rings_of(f["geometry"]):
            for x, y in sample_polygon(poly):
                st = idx.locate(x, y)
                if st:
                    hits[code][st] += 1
    state_l3 = defaultdict(list)
    for code, by_state in hits.items():
        for st, n in by_state.items():
            if n >= MIN_HITS:
                state_l3[st].append(code)
    out = OrderedDict()
    for st in sorted(state_l3):
        out[st] = sorted(state_l3[st], key=lambda c: int(c))
    return out, sorted(unmatched)


# ------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--l3-geo", default=os.path.join("public", "geo", "us_eco_l3_features.geojson"))
    ap.add_argument("--states-geo", default=os.path.join("public", "geo", "us-states.geojson"))
    ap.add_argument("--out", default=os.path.join("public", "api", "rd_thresholds_l3.json"))
    a = ap.parse_args()

    l3 = OrderedDict()
    name_to_code = {}
    nrows = 0
    with open(a.csv, newline="") as fh:
        for r in csv.DictReader(fh):
            nrows += 1
            code = str(int(r["L3"]))
            name_to_code[r["L3NAME"]] = code
            node = l3.setdefault(code, OrderedDict([("name", r["L3NAME"]), ("l2", r["L2NAME"]), ("types", [])]))
            src = {}
            for k, col in (("g", "G"), ("n", "N"), ("inc", "inc"), ("sev", "sev")):
                s = r[f"{col}_source"]
                if s not in SRC_CODE:
                    raise SystemExit(f"unknown source string {s!r}")
                src[k] = SRC_CODE[s]
            node["types"].append(OrderedDict([
                ("ftg", int(r["TYPGRPCD"])), ("tg", r["TGNAME"]), ("ft", int(r["FORTYPCD"])), ("ftn", r["FTNAME"]),
                ("pairs", int(float(r["pairs"]))),
                ("g", [r3(r["G_RD"]), r3(r["G_RD_lo"]), r3(r["G_RD_hi"])]),
                ("n", [r3(r["N_RD"]), r3(r["N_RD_lo"]), r3(r["N_RD_hi"])]),
                ("inc", [r3(r["inc_RD"]), r3(r["inc_RD_lo"]), r3(r["inc_RD_hi"])]),
                ("sev", [r3(r["sev_RD"]), r3(r["sev_RD_lo"]), r3(r["sev_RD_hi"])]),
                ("src", src),
            ]))
    l3 = OrderedDict(sorted(l3.items(), key=lambda kv: int(kv[0])))

    l3_geo = json.load(open(a.l3_geo))
    states_geo = json.load(open(a.states_geo))
    state_l3, unmatched = build_state_l3(l3_geo, states_geo, name_to_code)

    out = OrderedDict([
        ("schema", "perseus_rd_thresholds_v1"),
        ("generated", GENERATED),
        ("source", SOURCE),
        ("national", NATIONAL),
        ("source_codes", SOURCE_CODES),
        ("fields", OrderedDict([
            ("g", "gross growth breakpoint [RD, lo95, hi95]"), ("n", "net growth breakpoint [RD, lo95, hi95]"),
            ("inc", "mortality incidence breakpoint [RD, lo95, hi95]"), ("sev", "mortality severity breakpoint [RD, lo95, hi95]"),
            ("pairs", "remeasurement pairs in the cell"), ("ftg", "FIA forest type group code (TYPGRPCD)"),
            ("ft", "FIA forest type code (FORTYPCD)"),
        ])),
        ("state_l3_note", f"EPA Level III ecoregions intersecting each state, computed from "
                          f"public/geo/us_eco_l3_features.geojson and public/geo/us-states.geojson by grid sampling each "
                          f"ecoregion polygon and locating the samples in state polygons (pure Python ray casting); a state is "
                          f"listed when at least {MIN_HITS} samples fall in it. Geojson NA_L3NAME matched to the CSV L3NAME, "
                          f"with {len(NAME_ALIAS)} North American to US name aliases. Ecoregions in the geojson with no forest "
                          f"cells in Supplementary Data S1 are not listed: {', '.join(unmatched) if unmatched else 'none'}."),
        ("state_l3", state_l3),
        ("l3", l3),
    ])
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"), allow_nan=False)
    size = os.path.getsize(a.out)
    print(f"wrote {a.out}: {size/1e6:.2f} MB, {nrows} rows, {len(l3)} ecoregions, {len(state_l3)} states mapped")
    if unmatched:
        print("geojson ecoregions with no CSV rows (not mapped):", "; ".join(unmatched))
    for st in ("ME", "NH", "VT", "MI", "WI", "MN", "IN", "GA"):
        print(f"  {st}: {state_l3.get(st)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
