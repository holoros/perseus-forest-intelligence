# Changelog

The source under `main` and the deployed bundle under `gh-pages` are
**reconciled** (issue #15): every push to `main` auto-builds and deploys to
https://holoros.github.io/perseus-forest-intelligence/ via the Pages Action,
and the build reproduces the deployed bundle. Entries are most recent first.

### v1.9 — 2026-06-18 (deployed)
* **Forest health map coloring (refinement T1).** When the Forest health tab is
  active, the state choropleth now colors each state by its HRR priority forest
  area (current scenario) on a green-to-red sequential ramp, with a matching
  legend and a per-state hover readout. Any state with an HRR score is now
  clickable to drive the tab's selected-state readout. Surfaces the spatial
  gradient (climate-stressed Plains high, Pacific Northwest and northern New
  England low) that the ranked bars alone do not convey. Reuses the existing
  dependency-free SVG map; no new data or dependencies; non-regressive build.

### v1.8 — 2026-06-18 (deployed)
* **Forest Health / Risk / Resilience (HRR) tab.** New `Forest health` view
  (`src/HealthRiskResilience.jsx`) surfaces the national HRR data product
  (`api/hrr_states.json`, schema hrr_states_v2): 48-state results from 219,130
  FIA plots. Stress = biomass-weighted Potter (2017) species VCC + observed FIA
  disturbance; resilience = structure + VCC adaptive capacity; priority = high
  stress, low resilience. Shows the national priority share with its 90%
  sampling band and 7–18% structural-uncertainty range, a Current / RCP4.5 /
  RCP8.5 scenario toggle, a ranked per-state priority bar chart, the selected
  state's readout, and the scoring-weight caveat. The data product was already
  in the API (commit 8dcb2357); this wires the UI to it. Self-contained, no new
  dependencies; non-regressive Vite build.

### v1.4 — 2026-06-02 (deployed)
* **Chronosequence growth recalibration** (ADR 0002). The YC empirical engine's
  near-term growth is recalibrated to the FIA longitudinal remeasurement record
  (agedist + physical-ceiling variant): mean growth uplift ~1.44x by 2125
  (capped 2.0 for sparse states), near-term bias −0.68 → −0.41 %/yr, spatial
  r 0.78 → 0.84, t0 anchoring preserved. Diagnosed the prior low bias as a
  space-for-time (chronosequence) slope deficit.
* **Disturbance-exposed reserve scenario.** New `reserve (no harvest,
  disturbance-exposed)` bucket across carbon/biomass/volume metrics, with a band
  spanning historical / 2x / 3x disturbance frequency (FIA COND + GRM grounded).
  Shows passive carbon storage is conditional: under climate-elevated
  disturbance the no-harvest reserve can plateau or become a net source.
* Pipeline: `ycx_apply_recal_disturb.R` → `ycx_merge_perseus.py` (now registers
  new scenario buckets into `meta.buckets`). See `docs/decisions/0002-*` and
  `docs/results/disturbance_decline_scenario.md`.

## Deployed timeline (`gh-pages`)

### v1.3 — 2026-05-30 (deployed: bc28d99)
* Surfaced AOI upload as a top-level button: opens file dialog, reads
  zipped shapefile or GeoJSON, opens the AOI tool with the polygon
  pre-loaded.
* Staged the CSPI v3 canopy-height reference figure (OOB R^2 = 0.87,
  RMSE = 3.737 m, 58,475 training rows vs 5,502 prior).

### v1.2 — 2026-05-30 (deployed: 182457c)
* LCMS-style click-to-query point inspector. A crosshair cursor mode lets
  you click anywhere on the map and see a floating popover with lat/lon,
  encompassing state, EPA L3 ecoregion code/name/L1 biome, plus ycx AGB
  at age 50 for that ecoregion. State and L3 are clickable to jump to
  their respective views.

### v1.1 — 2026-05-30 (deployed: 82ad5a3)
* ycx year-slider animation: two new map modes (managed-harvest and
  reserve) color states by empirical AGC across years 2025 to 2075. Play
  button cycles at 0.7 s per step, pause and scrub interactive. When the
  EPA L3 overlay is on, L3 polygons animate in lockstep by corresponding
  stand age. Same canonical green carbon ramp as the libcbm trajectory
  map for visual consistency.

### v1.0 milestone — 2026-05-30 (deployed: 72424e1)
* Cross-engine divergence heatmap. 7 states x 21 engines table at year
  2050 with cells colored by percent deviation from state mean and states
  sorted by coefficient of variation. WA at 27 percent CV, MN at 31
  percent are the tightest; ME at 76 percent, OR at 75 percent, ID at 83
  percent show the widest engine spread.

### v0.99 — 2026-05-30 (deployed: 31126c8)
* AOI forward projection (Tier 3). Polygon centroid located in
  encompassing EPA L3 ecoregion via point-in-polygon, ycx Chapman-Richards
  curves looked up for that L3, rendered as SVG line charts in the AOI
  report at ages 5, 10, 20, 30, 50, 75, 100 (untreated solid, harvested
  dashed). Narrative paragraph leads with projected biomass at 50 yr.

### v0.98 — 2026-05-30 (deployed: 9b3a58c)
* AOI accepts user uploads: ESRI shapefile (zipped) or GeoJSON parsed
  in-browser via shpjs. Auto-projects WGS84 to SVG-px via the existing
  Albers code, picks the largest polygon outer ring, subsamples if more
  than 250 vertices. L3 ecoregion auto-selects from current state.

## Source timeline (`main`)

Tags on main, descending. Tag anchors are commits with `app-version`
matching the tag number in the corresponding `index.html`.

### v0.73 — 2026-05-29 (2e350e7)
* Extended the YC engine to a 100-year horizon with 4 management
  scenarios (reserve no-harvest, managed harvest, managed intensive,
  managed conservation).
* Finalized hierarchical Chapman-Richards curves with parameters
  varying by forest type, EPA L3 ecoregion, and ownership.
* Adopted the peak-and-decline yield form `y = b1 * Age^b2 * b3^Age`.
* Productivity-index comparison: CSPI is the best of the candidates;
  the climate-sensitivity beta is set to 0.45 (tempered from prior
  0.80 default) per the FIA remeasurement growth calibration.
* CSI-driven climate band: state-specific envelope replaces the flat
  plus/minus 10 percent band; 18 western/plains states use a modeled
  transfer outside the CSI domain.
* Methods page CONUS-complete at n=48.
* Stumpage view ($/MBF and $/cord by state, 120K observations
  1977-2026 deflated to real $24 via BLS CPI-U).
* Hansen GFC lossyear CONUS overlay added; per-state HTML reports
  added for 7 states (GA, ID, IN, ME, MN, OR, WA).

### v0.72 — 2026-05-29 (129500c)
* CONUS overlay legend + Chivehgenge attribution.

### v0.71 — 2026-05-29 (6eaf669)
* Methods page n=48 CONUS-complete.

### v0.59 to v0.70 — 2026-05-29
* Incremental methods-page expansions (n=15 to n=48), state-specific
  inventory stratification analyses (B1.1 vs B1.3 with FIA EXPNS
  calibration), Maine parity finding, and v0.78 stumpage data load.

### v0.56 — 2026-05-28 (5d7bbc3)
* FIA anchors added for GA and IN.

### v0.55 — 2026-05-27 (c583c84)
* Initial public deploy.
