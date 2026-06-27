# Canonical CONUS YC producers (CEM-harmonized)

Scripts that build the four canonical yield-curve engines published in the explorer:
`yc_fiadb_rcp45/85` and `yc_treemap_rcp45/85` (class YC). They emit the CEM per-state CI
schema (5 scenarios x rcp45/85 climate arms x 2025-2125) so the YC engines align with
CEM/FVS/CBM in `public/api/`.

| File | Role |
|---|---|
| `ycx_hybrid_fit2.R` | Fit the hybrid Chapman-Richards + decline-tail curves per forest-type x ecoregion x owner cell (carbon, biomass, total + merch volume). |
| `ycx_fit_band.R` | Compute the per-state x per-response CI band = plot-count-weighted population lack-of-fit (age-binned mean residual / mean), capped [3%,30%]. Writes `canonical_inputs/ycx_fit_bands.csv`. |
| `ycx_canonical_ci_fiadb.R` | FIADB-expansion CI producer. Per-state area anchored to `fia_anchor.csv` (published states) else `treemap_area.csv` (real forest area). |
| `ycx_canonical_ci_treemap.R` | TreeMap 2022 pixel-area-expansion CI producer; reserve t0 anchored to the production carbon baseline. |
| `ycx_stress_test.py` | Validates the 192 CI files + staging DB (coverage, schema, scenario monotonicity, CI ordering, anchoring, row counts). |
| `ingest_yc_production.sh` | Idempotent ingest of the 192 CI files into perseus_db (backs up the DB; collision-guarded). |
| `canonical_inputs/` | `fia_anchor.csv` (official per-state AGC), `treemap_area.csv` (per-state forest area), `ycx_fit_bands.csv` (CI bands). |

Run order: `ycx_hybrid_fit2.R` (per state) -> `ycx_fit_band.R` (per state) ->
`ycx_canonical_ci_fiadb.R` / `ycx_canonical_ci_treemap.R` -> `ycx_stress_test.py` ->
`ingest_yc_production.sh` -> `48_export_api.py`.
