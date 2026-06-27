# 0005. CSPI site-productivity asymptote covariate

Status: PROPOSED (draft; awaiting team sign-off on the beta and clamp knobs)
Date: 2026-06-27
Relates to: #75 (Block 1+3 to production), #76 (blocked CSPI plot join), ADR 0003 (hybrid recal engine)

## Context

The CONUS yield-curve cells (forest-type x ecoregion) are fit independently, with no
site-productivity term. The agreed upgraded design (#75) adds CSPI (climate site
productivity index) so cell asymptotes reflect carrying capacity and sparse cells borrow
strength. The intended plot-level join (CSPI ID -> PLT_CN, #76) is blocked: CSPI build
coordinates do not match the FIA true-coordinate convention (0% match at every precision).

## Decision

Use CSPI as a SPATIAL RASTER covariate, not a plot join. Sample the wall-to-wall 1 km
CSPI surface (CSPI_v2_5component_1km.tif, EPSG:4326, 0 to 100) at each FIA plot's
coordinates on Cardinal, aggregate to the fit cell key (ft_group|prov_code), and scale the
cell asymptote multiplicatively. FIA true coordinates never leave the cluster; only the
coordinate-free cell table (ycx_cell_cspi.csv) is emitted. This sidesteps #76 entirely.

Scaling form: A_scaled = A * (1 + shrink * (clamp((CSPI/REF)^beta) - 1)), with
REF = 56.36 (CONUS median CSPI), beta = 1.0, clamp = [0.80, 1.25],
shrink = 30 / (30 + n_plots). The free-fit exponent (2.77 within forest type, 3.13 pooled)
is REJECTED as confound-amplified and biologically too strong: productive ecoregions carry
both high CSPI and high-biomass forest types, and CSPI explains only ~9% of asymptote
spread. beta and the clamp half-width are documented ASSUMPTIONS (team knobs), mirroring
the senescence S_SEN convention, not estimated quantities.

t0 neutrality: behind the YCX_CSPI_ASYM flag, a second block re-anchors area for non-FIA
states so the scaled run reproduces baseline t0 (FIA-anchored states are already pinned via
the tg anchor). The flag is OFF by default; the live ycx_canonical_ci_fiadb.R is unchanged.

## Consequences

Verified on the full 48-state CONUS run (rcp45): CONUS aggregate is t0-neutral (+0.02% at
2025) and trajectory-neutral (-0.00% at 2125). The effect is redistributive at cell and
state scale (per-state 2125 delta -0.39% to +0.72%, median 0.00%), not a national shift.
360 of 873 cells (41%) are sparse (n_plots < 30) and receive full CSPI weight (mean scalar
0.976). The production value is sub-national accuracy and principled asymptotes where data
is thin, not a change to published CONUS totals, which is a virtue for a production change.

Open for sign-off before merge and data regeneration: the beta exponent (default 1.0) and
the clamp half-width (default +/- 25%). Raising beta increases the effect. This PR adds the
mechanism and provenance only; it does NOT regenerate live data or alter published numbers.
On sign-off, regenerate the canonical CI with the flag on, validate t0 vs FIA, and bump
the Zenodo record to v1.2.

## Stress-test update (2026-06-27)

A stress battery (knob sweep, spatial cross-validation, Bakuzis site-ordering; see
20260627_cspi_stress_bakuzis_assessment.md) revised the scope. Spatial leave-one-ecoregion-out
cross-validation shows CSPI generalizes on the REMEASUREMENT asymptotes (held-out log-RMSE
0.783 to 0.716, +8.5%, within-ft partial r +0.37) but NOT on the current HYBRID production
asymptotes (+0.0%, within-ft partial r +0.08; hybrid asymptotes are far noisier and are a
different, peak-decline parameter). Knob sweep is robust (A-weighted change ~3% at beta=1.0
clamp 25%, bounded under ~6% even at beta=2.0). Bakuzis site-ordering PASSES (monotone,
non-crossing site curves).

Revised decision: apply CSPI scaling to the remeasurement-track refit (the Block 1+3 curves
this ADR's #75 promotes), NOT the hybrid engine. The mechanism, t0-pin, and wiring are
reused unchanged; only the input fit table changes at promotion time. Do not promote CSPI on
the hybrid engine: harmless (CONUS-neutral, well-ordered) but unsupported out-of-sample.
Keep beta=1.0 and clamp +/-25%. This PR stays DRAFT until the remeas promotion lands.
