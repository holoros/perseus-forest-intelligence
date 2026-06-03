#!/usr/bin/env python3
"""Inject the standing-value trajectory metric (standing_value_musd, cls "VALUE") into
PERSEUS api/series/<ST>.json and register it in api/meta.json. Idempotent and additive:
loads each existing series file, sets the standing_value_musd key, writes back, leaving
all other metrics untouched. Run this after any api/series rebuild or deployed->source
sync to guarantee the value trajectory survives.

Data source: standing_value_series.json next to this script (per-engine value lines =
each state's AGC engine trajectory x its 2022 standing-value raster anchor; see
conus_hcs/R/poc_value_series_fixed.R).

Usage: python3 standing_value_merge.py <repo_dir>
"""
import json, os, sys

def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    here = os.path.dirname(os.path.abspath(__file__))
    api = os.path.join(repo, "public", "api")
    data = json.load(open(os.path.join(here, "standing_value_series.json")))

    # 1. register metric in meta.json (additive)
    mp = os.path.join(api, "meta.json")
    meta = json.load(open(mp))
    meta.setdefault("metrics", {})["standing_value_musd"] = {
        "label": "Standing timber value", "unit": "million USD (2020)",
        "kind": "value", "group": "economic"}
    json.dump(meta, open(mp, "w"), indent=1)
    print(f"meta.json: standing_value_musd registered ({len(meta['metrics'])} metrics)")

    # 2. inject series per state (additive)
    done = []
    for st, blk in data.items():
        sp = os.path.join(api, "series", f"{st}.json")
        if not os.path.isfile(sp):
            print(f"  skip {st}: no series file"); continue
        s = json.load(open(sp))
        s["standing_value_musd"] = blk["standing_value_musd"]
        json.dump(s, open(sp, "w"), separators=(",", ":"))
        done.append(st)
    print(f"series injected: {done}")

if __name__ == "__main__":
    main()
