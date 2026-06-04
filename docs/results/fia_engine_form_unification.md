# FIA engine form unification (v0.56 to v0.58)

All five FIA-plot stock metrics in the dashboard now run on a single model form:
the hybrid Chapman-Richards + decline curve with agedist + 95th-percentile ceiling
recalibration to the FIA longitudinal record. This replaces the peak-decline
empirical form, which over-projected century accumulation because it keeps adding
old-stand mass without an observed ceiling.

## What changed

`yc_fia_empirical_v1` was re-projected, metric by metric, on response-specific hybrid
fits and an observed-increment growth kernel, then injected back into the dashboard with
each state rescaled to its existing 2025 (t0) anchor so the lines stay continuous and
only the post-t0 trajectory shape changes.

| Metric | Unit | CONUS reserve, peak-decline | CONUS reserve, hybrid+recal | Near-term reserve growth |
|---|---|---|---|---|
| `agc_live_total` (carbon) | Tg C | +112% | **+63%** | 1.45 %/yr |
| `agb_dry` (biomass) | Tg dry | +113% | **+62%** | 1.44 %/yr |
| `vol_stem` (stem volume) | Mm3 | +112% | **+72%** | 1.77 %/yr |
| `merch_vol_mcf` (merch volume) | Mcf | +138% | **+66%** | 1.44 %/yr |
| `merch_bio_dry` (merch biomass) | Tg dry | +146% | **+70%** | 1.48 %/yr |

(Near-term growth = annualized 2025 to 2035 reserve increment on the projected series.)

The merch metrics carried the largest peak-decline overshoot (+138% / +146%), so they
move the most. Volume culminates later than carbon (reserve +72% vs +63%, 1.77 vs
1.45 %/yr near-term), which is expected: large old trees keep adding stem volume after
carbon density has begun to saturate.

For carbon, the swap also makes the FIA engine share a form with the TreeMap engine
(`yc_treemap_spatial_v1`, +48%), so the FIADB-vs-TreeMap spread reads as a true
inventory-basis range rather than a model-form artifact (see ADR 0003).

## Method

- Hybrid fits per response (`carbon_lbac`, `agb_tonac`, `voltot_cuftac`,
  `merchvol_cuftac`, `merchbio_tonac`) per forest-type x EPA-L3 province x owner cell,
  fallback cell -> ft -> state (`ycx_hybrid_fit2.R`).
- Vectorized 100-year projection over the 622,807-plot CONUS vector with the agedist +
  ceiling recalibration kernel, raster fire/insect disturbance, GRM density mortality,
  and owner-rotation harvest, across all 12 scenario buckets
  (`ycx_fia_hybrid_fullseries_vec.R` for carbon, `_agb.R` for biomass,
  `_resp.R` parameterized for volume/merch).
- Per-state t0 continuity rescale in the injector (`ycx_inject_hybrid.py`).

## Caveat

Volume and merch mortality-stressed buckets use a mortality rate mapped from the carbon
GRM grid via a per-response carbon ratio, because the GRM record does not carry mortality
at merch resolution. This is adequate for the secondary stress scenarios; wiring native
`dVOL.MORT` into the volume metric would tighten its stressed buckets if they become
decision-critical. Central (base) trajectories and the disturbance-exposed buckets do not
depend on this mapping.

## Provenance

- ADR 0003: `docs/decisions/0003-fia-agc-hybrid-recal-engine.md`
- Scripts: `scripts/yield_curve_engine/ycx_hybrid_fit2.R`,
  `ycx_fia_hybrid_fullseries_{vec,agb,resp}.R`, `ycx_inject_hybrid.py`
- Deployed: v0.56 (carbon), v0.57 (biomass), v0.58 (volume + merch)
