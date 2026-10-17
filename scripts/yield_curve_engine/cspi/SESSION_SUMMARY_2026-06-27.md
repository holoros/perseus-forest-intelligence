# CONUS YC session summary + handoff — 2026-06-27

*Consolidated record of the full autopilot session (run under autonomous-ooda-manager).
Covers the CSPI covariate investigation end to end, Block 4 carbon pools, SDI/RD projection,
the CONUS spatial products, and the terra/rasterio infrastructure resolution. Pairs with
CONUS_YC_MASTER_HANDOFF.md (prior engagement) and the dated track notes referenced below.
Nothing in this session touched the live explorer, the production perseus_db, or Zenodo.*

---

## 1. TL;DR

Investigated CSPI (climate site productivity index) as the #75 site-productivity covariate,
end to end. Result: CSPI is real and well-ordered, but its production value is on the spatial
density layer, not the anchored curve asymptote. Along the way: filled the canonical-CI carbon
pools (Block 4) from FIA, made SDI/RD projectable, built drop-in CONUS spatial overlays, and
retired the long-standing GDAL/terra blocker. Two external gates remain: the team's beta/clamp
sign-off (CSPI merge/publish) and future-climate data acquisition (Block 2).

---

## 2. The CSPI investigation (the spine of the session)

| Step | Finding |
|---|---|
| Extraction | CSPI sampled from the 1 km raster at FIA plot coords server-side, aggregated to fit cells (ft_group&#124;prov_code); 99.9% coverage, 873 cells. Sidesteps the blocked plot-level join (#76). |
| Wiring + 48-state runs (rcp45 + rcp85) | Flagged into the canonical engine with a t0-preserving re-anchor; CONUS t0 +0.02%, 2125 -0.00%; per-state -0.39% to +0.72%, median 0. Redistributive, t0-neutral. |
| Stress test | Knob sweep robust; spatial CV shows CSPI generalizes on the REMEAS asymptotes (+8.5%, r 0.37) but NOT on the HYBRID production fits (+0.0%); Bakuzis site-ordering PASS. |
| Decisive structural finding | A uniform asymptote scalar CANCELS in the t0-anchored reserve multiplier (ME/CA identical cap on vs off). The asymptote-cap production path is closed by proof, not opinion. |
| Spatial redirect | On the absolute density layer CSPI is NOT cancelled: it reallocates ~2% (mean 3.6 Mg/ha, up to 6%) of each state's standing carbon toward productive cells, totals preserved. This is CSPI's production home. |
| Production overlays | Built drop-in EPSG:5070 overlays at 20 km and CONUS 1 km, plus a Maine 30 m proof; geography coherent (E-W productivity divide, PNW/northern-hardwood gains). |

Bottom line: CSPI improves sub-state spatial carbon accuracy by a few percent; it does not (and
structurally cannot) change the t0-anchored trajectory via the asymptote. Knobs: beta=1.0,
clamp +/-25% (documented assumptions, team sign-off pending).

Detail: `OODA_cspi_asymptote_scaling.md` (5 addenda), `20260627_cspi_stress_bakuzis_assessment.md`.

---

## 3. Block 4 carbon pools (NA columns -> FIA-anchored full ecosystem)

FIA-anchored pool ratios (pool / live AG carbon) from TREE + COND, 48 states:

| Pool | CONUS ratio | Pool | CONUS ratio |
|---|---|---|---|
| Belowground (live) | 0.196 | Litter | 0.207 |
| Standing + down dead | 0.231 | Soil organic | 1.925 (dominant) |
| Understory | 0.048 | **Total non-AG** | **2.61x AG** |

Filled the six NA pool columns (`canonical_pools/`): CONUS reserve live AGC 10,901 Tg -> total
ecosystem 38,869 Tg (live AG = 28%, soil ~53%), matching published US forest budgets. Rule:
live-linked pools (BG, understory) scale with AGC(t); slow pools held at t0 (soil always). The
dead/litter coupling sensitivity bounds 100-yr total ecosystem change to +13.5% (slow pools
constant) .. +18.5% (fully track AGC); truth likely +14-16%.

Detail: `20260627_trackAB_terra_pools.md`.

---

## 4. SDI / RD projection (the structure gap, closed)

The carbon engine projects AGC but not TPA/QMD. Fix: fit SDI~AGC from FIA per-plot data
(46 states, mean r 0.88) and project SDI from the engine's AGC; RD = SDI/SDImax. Fills
sdi_mean_wtd / rd_mean_wtd over the trajectory. CONUS reserve RD 0.44 (2025) -> 0.54 (2125);
the t0 value cross-validates the direct FIA measurement (RD 0.46). t0 also computed directly
(`ycx_sdi_rd.csv`: CONUS SDI 207, RD 0.46). SDImax = 99th-pct plot SDI per state (per-cell
SDImax is the refinement).

Detail: `20260627_tracks123_render_sdi_climate.md`.

---

## 5. Infrastructure: the GDAL/terra blocker is retired

terra is unfixable on Cardinal (needs libproj.so.25 / libgdal.so.33; no proj/gdal modules
exist to relink/rebuild) but moot: rasterio (GDAL 3.9.3, bundled) works and is the supported
path. All raster work this session used rasterio. 30 m TreeMap rasters read fine in EPSG:5070.
ACTION for the handoffs: replace "gdal/terra broken, avoid terra" with "use rasterio."

---

## 6. Deliverables (all on Cardinal ~/yield_curves_conus and local
   ~/Documents/Claude/yield_curves_conus_summary)

Scripts:
- `ycx_cspi_cell_covariate.py` — CSPI extraction -> `ycx_cell_cspi.csv` (873 cells)
- `ycx_cspi_scale.R` — bounded/damped/shrunk asymptote scalar module
- `ycx_canonical_ci_fiadb_cspi.R` — flagged canonical engine (scaling + t0-pin)
- `ycx_canonical_ci_fiadb_remeas_cspi.R` — remeas-track variant
- `ycx_cspi_reconcile.py` — CONUS reconciliation
- `ycx_cspi_stress.py` — knob sweep + spatial CV + site-ordering
- `ycx_cspi_spatial.py` — spatial redistribution prototype
- `ycx_cspi_raster.py`, `ycx_cspi_raster_albers.py`, `ycx_cspi_conus_overlay.py`, `ycx_cspi_30m_me.py` — spatial rasters/overlays
- `ycx_pool_ratios.py` -> `ycx_pool_ratios.csv`; `ycx_pool_expand.py` -> `canonical_pools/`
- `ycx_sdi_rd.py` -> `ycx_sdi_rd.csv`; `ycx_sdi_agc_fit.py` -> `ycx_sdi_agc_fit.csv`; `ycx_sdi_project.py`

Spatial products (drop-in, EPSG:5070 + bounds.json): `conus_cspi_scalar.{png,tif}`,
`conus_yc_agc_{base,cspi,cspidiff}.png`, `me_cspi_scalar_300m.tif`.

Figures: `cspi_vs_asymptote.png`, `cspi_raster_diff.png`, `conus_cspi_scalar_review.png`,
`conus_yc_cspi_albers_review.png`, `me_cspi_scalar_300m.png`.

Docs: `OODA_cspi_asymptote_scaling.md`, `20260627_cspi_stress_bakuzis_assessment.md`,
`20260627_trackAB_terra_pools.md`, `20260627_tracks123_render_sdi_climate.md`,
`HANDOFF_CSPI_75_2026-06-27.md`, this file.

GitHub: draft PR #91 (holoros/perseus-forest-intelligence, branch
`feature/cspi-asymptote-covariate`) — CSPI scripts, covariate table, ADR 0005, stress memo,
spatial scripts. Flag off by default; no live-data regen. DRAFT pending sign-off.

Zenodo: v1.2.0 staged (NOT published) at Cardinal
`zenodo_staging/perseus-yield-curves/v1.2/` against concept DOI 10.5281/zenodo.20959003.

---

## 7. Open gates (neither resolvable by autopilot)

1. **CSPI beta / clamp sign-off (team).** beta=1.0, clamp +/-25%. On sign-off: decide the
   production home (recommended: spatial density layer, since the asymptote cap is a no-op),
   then merge #91 + deploy the CONUS CSPI overlay additively to gh-pages + publish Zenodo v1.2.
2. **Block 2 rcp-native climate: future-climate data.** Needs downscaled rcp45/85 future normals
   (ClimateNA future or CMIP) -> clim_ranger -> per-rcp CSI. Engine hook already present.

---

## 8. Queued next steps (when unblocked / resourced)

- Full CONUS 30 m density render: tiled rasterio over TreeMap2016_FLDTYPCD.tif (forest type ->
  cell -> density x CSPI); pipeline proven on Maine.
- Block 4 refinements: slow dead/litter input-decay dynamics; per-cell SDImax for RD.
- Deploy the CONUS CSPI overlay + pooled/SDI-filled CI to the explorer after sign-off.
- Block 2 once future climate is obtained.

---

## 9. Resume / reproduction notes

- Cardinal access: hpc-cardinal skill (key auto-loaded from ~/Documents/Claude/.ssh-cardinal);
  re-run the session-setup block each bash call (sandbox is per-call).
- Raster work: rasterio (GDAL 3.9.3), NOT terra. FIA true coords stay server-side; only gridded
  / coordinate-free outputs leave (true-coords protocol honored throughout).
- Engine: `module load gcc/12.3.0 R/4.4.0`. Flag `YCX_CSPI_ASYM=1` turns on CSPI in the
  `*_cspi.R` engines; default off reproduces the live engine.
- Splicing R via python on Cardinal: use a QUOTED heredoc (`<<'PY'`) or the shell mangles quotes.
- The canonical/ CI is the FIA-anchored production data (CONUS reserve t0 = 10,901 Tg). The
  ci_full*/ and ci_rem*/ dirs are session experiments (flat2400-heavy; comparison only).
