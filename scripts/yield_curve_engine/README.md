# YC empirical yield-curve engine — script map

The YC engine (`yc_fia_empirical_v1` / `yc_hybrid_v1`) projects the current FIA
inventory forward along FIA-anchored yield curves to produce the per-state
calendar-year series the dashboard renders. Scripts run on OSC Cardinal against
the FIADB + TreeMap-2022; outputs are merged into `public/api/series/*.json`.

## Current production pipeline (run order)

1. `ycx_00_strata.R` — build EPA-L3 × forest-type × ownership membership per plot.
2. `ycx_hybrid_fit2.R` — fit the production hybrid form (CR rise + decline tail
   past empirical culmination A*) per cell, multi-response (carbon + biomass).
   Supersedes `ycx_01_curves.R` (peak-decline) and `ycx_hybrid_fit.R` (carbon only).
3. `ycx_hybrid_anchor.R` — FIA-anchor the hybrid so 2022 standing carbon matches.
4. `ycx_02_perseus.R` — project current inventory → per-state year series for all
   metrics and management scenarios (reserve / managed buckets); harvest flux.
5. `ycx_treemap_hybrid.R` / `ycx_treemap_scenarios_hybrid.R` — CONUS spatial
   (TreeMap-2022 pixel) projection + scenarios.
6. **Recalibration + disturbance (v1.4, ADR 0002):**
   - `ycx_ingrowth_gap.R` — diagnose the chronosequence slope deficit.
   - `ycx_recal_cell.R` — cell-level g_obs fit + stress tests (CV, weight sweep,
     ceiling, bootstrap).
   - `ycx_recal_capped_export.R` — export the approved agedist+ceiling per-state
     trajectory.
   - `ycx_disturbance_quantify.R` — FIA COND disturbance rates + severity.
   - `ycx_disturb_scenario.R` — disturbance-exposed reserve arms (per-state).
   - `ycx_endog_mortality.R` — GRM density-dependent mortality (mechanism check).
   - `ycx_apply_recal_disturb.R` — wire recalibration + disturbance scenario onto
     the per-state series (staging).
7. `ycx_merge_perseus.py` — inject YC series into `public/api`, FIA-anchor totals,
   register metrics + scenario buckets in `meta.json`.

## Support / calibration

`ycx_csi_sample.R`, `ycx_calibrate.R`, `ycx_grm_beta.R`, `ycx_index_test.R`
(climate-site-index productivity band); `ycx_validate_obs.R` (per-state observed
growth); `ycx_fiadb_vs_treemap.R` (inventory cross-check); `ycx_products.R`,
`ycx_hwp*.R` (product resolution + harvested-wood-products carbon);
`ycx_build_rasters.R` (web rasters). Batch helpers: `ycx_array.sh`,
`ycx_split_states.sh`, `ycx_submit.sh`. Series export: `ycx_extract_series.py`.

## Superseded (kept for provenance, not in the live path)

`ycx_01_curves.R` (peak-decline form, replaced by the hybrid per ADR 0001);
`ycx_hybrid_fit.R` (single-response, replaced by `_fit2`);
`ycx_modelform_explore.R`, `ycx_hybrid_modelform.R` (model-form CV studies);
the standalone merge variants `ycx_hybrid_merge.py`, `ycx_netstock_merge.py`,
`ycx_products_scenarios_merge.py`, `ycx_promote_hybrid_merge.py` (historical
merge steps folded into `ycx_merge_perseus.py`).
