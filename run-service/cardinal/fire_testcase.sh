#!/bin/bash
# Fire a multi-model on-demand PERSEUS run for a point. Demo-friendly.
# Usage:  ./fire_testcase.sh [lon] [lat] [run_id]
#   defaults to a point in Maine. Run from anywhere; reads the runner in ~/perseus_run.
LON=${1:--69.0}; LAT=${2:-45.2}; RID=${3:-demo_$(date +%H%M%S)}
RUN=~/perseus_runs/$RID
mkdir -p "$RUN"
cat > "$RUN/spec.json" <<SPEC
{"spec_version":"1.0",
 "aoi":{"type":"point","lon":$LON,"lat":$LAT},
 "models":["fvs","cbm","cem","yield"],
 "assumptions":{"management":["reserve","baseline"],"climate":["historic"],"disturbance":["historic"],"horizon_year":2100},
 "markets":{"price_scenario":"base","carbon_usd_per_tco2e":20},
 "outputs":["agc"],
 "tier":"subscriber"}
SPEC
cd ~/perseus_run && python3 run_scenario.py "$RUN"
echo "Result: $RUN/result.json"
