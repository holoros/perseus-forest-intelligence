#!/usr/bin/env python3
"""
Cardinal scenario runner. Reads a run-spec, runs the selected engines for the AOI
under each assumption combination, writes result.json.

Usage:  python run_scenario.py <run_dir>
  <run_dir>/spec.json    input run-spec (see run_spec.schema.json)
  <run_dir>/result.json  output: per-scenario trajectories + provenance

The "yield" engine is fully wired (real per-L3 yield-curve lookup); FVS/CBM/CEM/
LANDIS are dispatch stubs to be filled with the existing PERSEUS engine code.
Pure-Python (json + ray-cast point-in-polygon); no geospatial deps required.

Inputs expected alongside this script (staged on Cardinal):
  us_eco_l3_features.geojson   EPA L3 polygons (NA_L3CODE)
  yield_curves_by_l3.json      fitted yield curves per L3
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
MGMT_CURVE = {"reserve": "untreated", "baseline": "harvested", "increased": "harvested",
              "intensive": "harvested", "climate_smart": "harvested"}
# Output metric -> yield-curve series name
OUT_CURVE = {"agb": "agb_tonac", "agc": "carbon_lbac", "carbon_value": "carbon_lbac",
             "volume": "voltot_cuftac", "harvest_value": "merchvol_cuftac"}


def _point_in_ring(lon, lat, ring):
    inside = False; n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_poly(lon, lat, geom):
    t = geom.get("type"); c = geom.get("coordinates")
    polys = [c] if t == "Polygon" else (c if t == "MultiPolygon" else [])
    for poly in polys:
        if poly and _point_in_ring(lon, lat, poly[0]):
            if not any(_point_in_ring(lon, lat, poly[h]) for h in range(1, len(poly))):  # holes
                return True
    return False


def poly_centroid(geom):
    """Mean of exterior-ring vertices of a Polygon/MultiPolygon (good enough for resolution)."""
    t = geom.get("type"); c = geom.get("coordinates")
    rings = [c[0]] if t == "Polygon" else ([p[0] for p in c] if t == "MultiPolygon" else [])
    xs, ys = [], []
    for ring in rings:
        for pt in ring:
            xs.append(pt[0]); ys.append(pt[1])
    return (sum(xs) / len(xs), sum(ys) / len(ys)) if xs else (None, None)


def resolve_l3(lon, lat):
    gj = json.loads((HERE / "us_eco_l3_features.geojson").read_text())
    for ft in gj["features"]:
        if _point_in_poly(lon, lat, ft["geometry"]):
            return ft["properties"].get("NA_L3CODE")
    return None


# Built-in forward price paths (illustrative stumpage; team replaces with regional series).
PRICE_PATHS = {
    "low":  {"sawtimber_usd_per_cuft": 0.20, "pulp_usd_per_cuft": 0.03, "biomass_usd_per_ton": 1.0,  "carbon_usd_per_tco2e": 8},
    "base": {"sawtimber_usd_per_cuft": 0.35, "pulp_usd_per_cuft": 0.05, "biomass_usd_per_ton": 2.0,  "carbon_usd_per_tco2e": 15},
    "high": {"sawtimber_usd_per_cuft": 0.55, "pulp_usd_per_cuft": 0.09, "biomass_usd_per_ton": 4.0,  "carbon_usd_per_tco2e": 30},
}
SAW_FRACTION = 0.55  # share of merch volume sold as sawtimber vs pulp (illustrative)


def run_yield(node, l3, mgmt, outputs, horizon):
    if not node:
        return {"_status": "no_curve_for_l3", "_l3": l3}
    cm = node.get("curves", {})
    series = MGMT_CURVE.get(mgmt, "harvested")
    res = {"_status": "ok", "_l3": l3, "_management_curve": series}
    for out in (outputs or ["agb", "agc"]):
        cname = OUT_CURVE.get(out)
        if cname and cname in cm and series in cm[cname]:
            res[out] = cm[cname][series]
    return res


def run_markets(node, mgmt, markets):
    """Economic outputs from the yield curves: carbon value, harvest value, simple NPV."""
    if not node:
        return {"_status": "no_curve_for_l3"}
    cm = node.get("curves", {})
    series = MGMT_CURVE.get(mgmt, "harvested")
    m = dict(PRICE_PATHS.get((markets or {}).get("price_scenario", "base"), PRICE_PATHS["base"]))
    m.update({k: v for k, v in (markets or {}).items() if v is not None and k != "price_scenario"})
    r = m.get("discount_rate", 0.04)
    blend = SAW_FRACTION * m["sawtimber_usd_per_cuft"] + (1 - SAW_FRACTION) * m["pulp_usd_per_cuft"]
    out = {"_status": "ok", "_price_scenario": (markets or {}).get("price_scenario", "base"), "_discount_rate": r}

    merch = cm.get("merchvol_cuftac", {}).get(series)        # cu ft/ac standing merch volume by age
    carb = cm.get("carbon_lbac", {}).get(series)             # lb C/ac by age
    if merch:
        out["harvest_value"] = [[a, round(v * blend, 1)] for a, v in merch]     # $/ac if harvested at age a
        # NPV of harvesting once at horizon age (illustrative): value / (1+r)^age
        a_h, v_h = merch[-1]
        out["npv_harvest_at_horizon"] = round((v_h * blend) / ((1 + r) ** a_h), 1)
    if carb:
        cprice = m["carbon_usd_per_tco2e"]
        # lb C -> tCO2e: /2204.62 (to t C) * 44/12
        out["carbon_value"] = [[a, round((lb / 2204.62) * (44.0 / 12.0) * cprice, 1)] for a, lb in carb]
        # PV of carbon stock value at horizon (illustrative)
        a_c, lb_c = carb[-1]
        out["npv_carbon_at_horizon"] = round(((lb_c / 2204.62) * (44.0 / 12.0) * cprice) / ((1 + r) ** a_c), 1)
    return out


# ---- multi-model engines: real precomputed PERSEUS series (per state x mgmt x metric) ----
MODEL_CLS = {"fvs": "FVS", "cbm": "CBM", "gcbm": "CBM", "cem": "CEM", "landis": "LANDIS", "yield": "YC"}
MGMT_SERIES_LABEL = {"reserve": "reserve (no harvest)", "baseline": "managed (harvest)",
                     "increased": "managed (intensive)", "intensive": "managed (intensive)",
                     "climate_smart": "managed (conservation)", "accelerated": "managed (intensive)"}
OUTPUT_METRIC = {"agc": "agc_live_total", "carbon_value": "agc_live_total", "agb": "agb_dry",
                 "volume": "merch_vol_mcf", "harvest_value": "standing_value_musd",
                 "npv": "standing_value_musd", "es_water": "es_bundle_score",
                 "es_habitat": "es_bundle_score", "hrr_priority": "any_disturbance_rate_pct"}


def resolve_state(lon, lat):
    gj = json.loads((HERE / "us-states.geojson").read_text())
    for ft in gj["features"]:
        if _point_in_poly(lon, lat, ft["geometry"]):
            return ft["properties"].get("state")
    return None


def load_series(state):
    f = HERE / "series" / ((state or "") + ".json")
    return json.loads(f.read_text()) if state and f.exists() else None


def run_series_engine(model, series, mgmt, metric_key, climate):
    """Return real model trajectories for one engine class, management, and metric."""
    if not series:
        return {"_status": "no_state_series"}
    cls = MODEL_CLS.get(model)
    node = series.get(metric_key) or {}
    label = MGMT_SERIES_LABEL.get(mgmt, "managed (harvest)")
    entries = node.get(label, [])
    matched = [e for e in entries if e.get("cls") == cls]
    if climate and climate != "historic":  # prefer models that resolve the requested climate
        cf = [e for e in matched if climate in (e.get("model", "").lower())]
        if cf:
            matched = cf
    return {"_status": "ok" if matched else "no_data", "cls": cls, "metric": metric_key,
            "management_label": label, "n_models": len(matched),
            "models": [{"model": e["model"], "label": e.get("label"),
                        "pts": [[p[0], p[1]] for p in e["pts"]]} for e in matched]}


def main(run_dir):
    rd = Path(run_dir)
    spec = json.loads((rd / "spec.json").read_text())
    aoi = spec["aoi"]; a = spec.get("assumptions", {})
    outputs = spec.get("outputs")
    horizon = a.get("horizon_year", 2100)
    markets = spec.get("markets", {})
    # Resolve a representative lon/lat: point coords, or polygon/inventory centroid.
    if aoi.get("type") == "point" and aoi.get("lon") is not None:
        lon, lat = aoi["lon"], aoi["lat"]
    elif aoi.get("geometry"):
        lon, lat = poly_centroid(aoi["geometry"])
    else:
        lon = lat = None
    l3 = aoi.get("l3code") or (resolve_l3(lon, lat) if lon is not None else None)
    state = aoi.get("state") or (resolve_state(lon, lat) if lon is not None else None)
    curves = json.loads((HERE / "yield_curves_by_l3.json").read_text())
    node = curves.get("l3", {}).get(l3) if l3 else None
    series = load_series(state)
    metric_key = OUTPUT_METRIC.get((outputs or ["agc"])[0], "agc_live_total")

    combos = [(m, c, d) for m in a.get("management", ["baseline"])
              for c in a.get("climate", ["historic"]) for d in a.get("disturbance", ["historic"])]
    scenarios = []
    for (m, c, d) in combos:
        eng = {model: run_series_engine(model, series, m, metric_key, c) for model in spec["models"]}
        econ = run_markets(node, m, markets)
        scenarios.append({"management": m, "climate": c, "disturbance": d, "engines": eng, "economics": econ})
    out = {"id": rd.name, "aoi": aoi, "state": state, "l3code": l3, "metric": metric_key,
           "horizon": horizon, "markets": markets, "n_scenarios": len(scenarios), "scenarios": scenarios,
           "note": "Multi-model engines = real precomputed PERSEUS series (FVS/CBM/CEM/YC) by state x management x metric; economics from per-L3 yield curves x forward price paths."}
    (rd / "result.json").write_text(json.dumps(out, indent=1))
    ne = {k: scenarios[0]["engines"][k].get("n_models") for k in scenarios[0]["engines"]} if scenarios else {}
    print("wrote", rd / "result.json", "| state:", state, "| L3:", l3, "| metric:", metric_key,
          "| scenarios:", len(scenarios), "| models/engine:", ne)


if __name__ == "__main__":
    main(sys.argv[1])
