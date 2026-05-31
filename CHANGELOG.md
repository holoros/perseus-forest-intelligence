# Changelog

This project ships in two places that have temporarily diverged:

* The React + Vite + MapLibre **source** under `main` is at app version v0.73.
  The latest tag on main is `v0.73` (and the new `v0.73-source` anchor at the
  current main head).
* The **deployed bundle** under `gh-pages`, served at
  https://holoros.github.io/perseus-forest-intelligence/, is at app version
  v1.3. The new `v1.3-deployed` tag anchors that bundle.

Until those two states are reconciled (see `CONTRIBUTING.md`), this changelog
documents both timelines separately. Entries are most recent first within
each timeline.

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
