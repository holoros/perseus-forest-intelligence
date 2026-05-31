# Source / deploy desync inventory

State as of 2026-05-31:

* `main/src` is at app version v0.73 (anchored as tag `v0.73-source`).
* `gh-pages` serves the deployed bundle at app version v1.3 (anchored as tag `v1.3-deployed`).

The deployed bundle is minified and ships without source maps, so a clean
extraction of the v1.3 source from gh-pages is not possible. This document
catalogues each v1.3 feature so the next contributor with access to the
canonical v1.3 source (likely on Aaron's Fedora workstation, the perseus
build pipeline, or `~/perseus_db` on Cardinal) can land each one as its
own PR against main.

The six features below were added between v0.97 (last shared with main
source) and v1.3 (current gh-pages). They are confirmed present in the
deployed bundle via string-signature search.

## v0.98 — AOI accepts user uploads

Deployed 2026-05-30 19:38 in gh-pages commit `9b3a58c`.

* Accepts a zipped ESRI shapefile (`.zip` containing `.shp` + `.dbf` + `.shx`) or a `.geojson` / `.json` file.
* Parses in-browser via the `shpjs` library (adds ~148 KB to the bundle).
* Auto-projects WGS84 to SVG-px via the existing Albers projection code.
* Picks the largest polygon outer ring.
* Subsamples vertices if more than 250.
* L3 ecoregion auto-selects from the current state (highest n_fits).

Confirmed strings in bundle: "Upload AOI", "shapefile".

## v0.99 — AOI forward projection (Tier 3)

Deployed 2026-05-30 20:54 in gh-pages commit `31126c8`.

* Polygon centroid located in encompassing EPA L3 ecoregion via point-in-polygon.
* `ycx` Chapman-Richards curves looked up for that L3.
* Renders as SVG line charts in the AOI report at ages 5, 10, 20, 30, 50, 75, 100 (untreated solid, harvested dashed).
* Narrative paragraph leads with projected biomass at 50 yr.
* Works for drawn polygons, mill presets, and uploaded shapefiles / GeoJSON alike.

Confirmed strings in bundle: "AOI summary" (3), "AOI report".

## v1.0 — Cross-engine divergence heatmap

Deployed 2026-05-30 21:00 in gh-pages commit `72424e1`.

* 7-state by 21-engine table at year 2050.
* Cells colored by percent deviation from state mean (blue below, red above).
* States sorted by coefficient of variation.
* Click state name to set active state.
* Reveals tight clustering (WA 27%, MN 31%) vs wide spread (ME 76%, OR 75%, ID 83%).

Confirmed strings in bundle: "Engine spread", "divergence" (5).

## v1.1 — `ycx` year-slider animation

Deployed 2026-05-30 21:24 in gh-pages commit `82ad5a3`.

* Two new map modes: `ycx managed harvest` and `ycx reserve`.
* Color states by empirical AGC across years 2025 to 2075.
* Play button cycles at 0.7 s per step; pause and scrub interactive.
* When EPA L3 overlay is on, L3 polygons animate in lockstep by corresponding stand age (year - 2025).
* Uses the canonical green carbon ramp for visual consistency with the `libcbm` trajectory map.

Confirmed strings in bundle: "managed harvest" (2).

## v1.2 — Click-to-query point inspector

Deployed 2026-05-30 21:32 in gh-pages commit `182457c`.

* New "inspect point" button in map controls switches cursor to crosshair.
* Click anywhere on the map: floating popover shows lat/lon, encompassing state, EPA L3 ecoregion code / name / L1 biome, and `ycx` AGB at age 50 for that ecoregion.
* State and L3 are clickable to jump to their respective views.
* Crosshair marker renders at the query point.
* Inspired by https://lcms-viewer.fs2c.usda.gov/treemap.

Confirmed strings in bundle: "inspect point", "L3 ecoregion" (4), "EPA L3" (6).

## v1.3 — Top-level AOI upload button + CSPI v3 reference figure

Deployed 2026-05-31 01:38 in gh-pages commit `bc28d99`.

* Surfaced AOI upload as a top-level button (green "Upload AOI" next to the existing "Draw AOI summary").
* One-click: opens file dialog, reads .zip shapefile or .geojson, opens AOI tool with polygon pre-loaded.
* CSPI v3 reference figure staged (canopy height prediction, OOB R^2 = 0.87, RMSE = 3.737 m, 58,475 training rows vs 5,502 prior).

Confirmed strings in bundle: "Upload AOI", "CSPI" (3).

## Reconciliation procedure

For each feature:

1. Locate the canonical source on Aaron's Fedora workstation or the perseus build pipeline. The v1.3 features were added incrementally on a working branch that has not yet been pushed to GitHub.
2. Open a feature branch off `main`, e.g. `feature/v0.98-aoi-upload`.
3. Land just that feature's changes. Verify with `npm run dev` locally.
4. Open a PR labeled `desync`. CI runs `npm ci` + `npm run build` via the existing `.github/workflows/build-check.yml` (the deploy workflow remains workflow_dispatch only).
5. Merge.
6. After all six v1.3 features are reconciled, flip `.github/workflows/deploy-pages.yml` trigger back to `push: branches: [main]` and tag a new `v1.4-source` release matching the new main.

## Reconciliation order

Land in version order so the cumulative diff to main stays small:

1. v0.98 AOI upload (adds shpjs dependency)
2. v0.99 AOI forward projection (depends on v0.98)
3. v1.0 Engine spread heatmap (independent)
4. v1.1 ycx animation (independent)
5. v1.2 point inspector (independent)
6. v1.3 top-level AOI button + CSPI v3 reference (depends on v0.98)
