# CSPI stress test + Bakuzis assessment (#75)

*2026-06-27. Autonomous OODA run. Stress-tests the CSPI asymptote covariate on three axes:
knob sensitivity, spatial cross-validation (generalization), and Bakuzis site-ordering
(biological realism). Companion to OODA_cspi_asymptote_scaling.md.*

## Headline

The CSPI covariate is **biologically sound and bounded, and its signal is real and
generalizable on the remeasurement asymptotes (the #75 refit), but NOT on the current
hybrid production asymptotes that the flagged engine scales.** This is a target mismatch:
CSPI should be applied to the remeasurement-track curves it was validated against, which is
exactly what the Block 1+3 dev-to-prod promotion produces. Applying it to the current hybrid
fits is harmless (CONUS-neutral, well-ordered) but adds no out-of-sample predictive value.

## A. Knob sensitivity (beta x clamp)

Per-cell scalar over 3,662 hybrid carbon cells. A-weighted mean |asymptote change| and the
fraction of cells whose raw scalar hits the clamp:

| beta | clamp | median | p05 | p95 | A-wt mean &#124;change&#124; | % clamped |
|---|---|---|---|---|---|---|
| 0.5 | 0.25 | 1.000 | 0.976 | 1.019 | 1.6% | 0.0 |
| 1.0 | 0.25 | 1.001 | 0.955 | 1.038 | 3.2% | 4.8 |
| 1.5 | 0.25 | 1.001 | 0.941 | 1.058 | 4.3% | 15.3 |
| 2.0 | 0.25 | 1.001 | 0.933 | 1.077 | 5.1% | 27.6 |
| 2.0 | 0.40 | 1.001 | 0.918 | 1.080 | 6.0% | 9.4 |

Reading: the production setting (beta=1.0, clamp +/-25%) moves asymptotes ~3% on an
A-weighted basis with 4.8% of cells clamped. Even at beta=2.0 the effect stays under ~6%,
and the clamp engages more (protecting against runaway), confirming the bounding works as
designed. Conclusion is robust to the knobs: no setting produces a destabilizing effect.

## B. Spatial cross-validation (leave-one-ecoregion-out, within forest type)

Does cell CSPI predict the held-out cell asymptote out-of-sample? Fit log(A) ~ log(CSPI) on
all but one ecoregion within a forest type, predict the held-out ecoregion, compare RMSE to
a no-CSPI forest-type-mean baseline.

| Asymptote set (what is scaled / validated) | within-ft partial r | CV RMSE base | CV RMSE +CSPI | improvement | ft improved |
|---|---|---|---|---|---|
| Hybrid (engine currently scales these) | +0.077 | 1.489 | 1.488 | +0.0% | 7/26 |
| Remeas (CSPI signal source; the #75 refit) | +0.373 | 0.783 | 0.716 | **+8.5%** | 13/25 |

Reading: on the **remeas** asymptotes CSPI generalizes (held-out RMSE drops 8.5%, most
forest types improve, log-RMSE 0.78). On the **hybrid** asymptotes CSPI has no out-of-sample
skill (+0.0%) and the asymptotes are far noisier (log-RMSE 1.49 ~ 4.4x spread), reflecting a
different parameter (peak-decline form A) than the remeas saturating asymptote. The earlier
in-sample correlation (0.45 pooled, 0.37 within-ft) was on the remeas fits and held up under
CV there; it does not transfer to the hybrid fits.

## C. Bakuzis site-ordering (biological realism)

The full Bakuzis matrix (Eichhorn, Reineke) needs HT/TPH/QMD, which the YC engine does not
carry; the applicable law-like relation is site ordering. CSPI quartile classes (midpoints
47.1, 55.3, 59.3, 62.5) were turned into representative carbon trajectories via the median
hybrid curve with class-scaled asymptote.

- Asymptote ordering Q1 < Q2 < Q3 < Q4 at every age: **PASS**
- No site-curve crossings across age 5 to 100: **PASS**
- Carbon at age 100 by class: 63,965 < 75,102 < 80,608 < 84,867 (monotone)

Per the Bakuzis principle, this falsifies-but-does-not-confirm: the CSPI mechanism does not
violate site ordering and produces properly ranked, non-crossing site curves. It is
biologically well-behaved.

## Recommendation

1. **Re-scope the target.** Apply CSPI scaling to the remeasurement-track asymptotes (the
   Block 1+3 refit that #75 promotes to production), not the current hybrid fits. The
   mechanism, t0-pin, and engine wiring are all reusable as-is; only the input fit table
   changes from `ycx_<ST>_hybrid_fits.csv` to the remeas cell fits at promotion time.
2. **Keep the conservative knobs.** beta=1.0 and clamp +/-25% are safe and bounded; the CV
   gain on remeas (+8.5%) does not justify a higher beta, and higher beta increases clamping.
3. **Hold the PR as draft and the Zenodo deposit as staged** until the remeas-track promotion
   lands, then wire CSPI to it and re-run this stress battery on the remeas-scaled engine.
4. **Do not promote CSPI on the hybrid engine.** It is harmless but unsupported there; doing
   so would add complexity with no validated benefit.

This is the OODA adversarial value: the stress test caught that the validated signal and the
scaled target were different curve forms, which the in-sample correlation alone had masked.

```
[STRESS_STATE]: knob sweep robust; spatial CV shows CSPI generalizes on remeas (+8.5%) not hybrid (+0.0%); Bakuzis site-ordering PASS.
[DECISION]: re-scope CSPI to the remeas-track production refit; keep beta=1.0/clamp 25%; keep PR draft + Zenodo staged.
[NEXT]: when Block 1+3 remeas fits are promoted, swap the engine input to remeas, re-run stress, then merge + publish.
```

## ADDENDUM: remeas-track engine run (48 states, rcp45)

Built `ycx_canonical_ci_fiadb_remeas_cspi.R` (reads remeas cell fits, 2-part cell key) and
ran the full 48 states, CSPI off vs on. This is the validated configuration: CSPI applied to
the asymptotes where it generalizes.

**CSPI effect on the remeas form (the clean test):**

| Scenario | 2025 | 2075 | 2125 |
|---|---|---|---|
| Reserve | +0.00% | +0.01% | +0.01% |
| BAU | +0.00% | +0.01% | +0.01% |

Per-state 2125 delta -0.39% (NE) to +0.29% (CA), median 0.00%. Same conclusion as on the
hybrid form: CSPI is t0-neutral and CONUS-neutral, redistributive at cell/state scale. The
difference is that here it is applied to the form where its out-of-sample skill is real.

**Curve-form caution (separate, important).** The remeas potential-growth form over-projects
relative to the hybrid production form: CONUS reserve carbon (raw engine sums, flat2400-heavy
area, comparison-only) is 77,724 (2025) and 179,804 (2125) for remeas vs 55,177 and 77,490
for hybrid. The remeas (d=0, saturating, no decline) curves keep climbing while the hybrid
peak-decline curves turn over, so remeas is ~2.3x higher by 2125. This confirms the standing
caution (CONUS_YC_MASTER_HANDOFF gotcha): the monotone remeas potential-growth curves must
NOT be promoted as the reserve trajectory; the reserve arm needs the realized curve
(potential x CSPI carrying-capacity x disturbance x senescence, the Block 5 form).

**Synthesis (the production home for CSPI).** CSPI generalizes on the remeas asymptotes
(+8.5% CV) and is biologically well-ordered (Bakuzis PASS), but the raw remeas potential
over-projects. CSPI's correct production role is as the carrying-capacity term in the
realized reserve curve: remeas potential growth, capped by CSPI site productivity, drawn down
by age-structured disturbance and explicit senescence (Block 5). It is necessary but not
sufficient on its own. CSPI should NOT be bolted onto the hybrid engine (no skill) nor used
to scale the raw remeas potential alone (over-projects); it belongs in the Block 5 realized
curve as the asymptote cap. beta=1.0, clamp +/-25% remain the right knobs.

```
[REMEAS_RUN]: 48/48 both arms; CSPI t0-neutral (+0.00%) and CONUS-neutral (+0.01% at 2125), redistributive; applied to the validated form.
[CURVE_FORM]: remeas potential over-projects ~2.3x vs hybrid by 2125 (d=0 monotone, no decline); not promotable as the reserve trajectory alone.
[PRODUCTION_HOME]: CSPI = the carrying-capacity cap in the Block 5 realized reserve curve (potential x CSPI x disturbance x senescence), not the hybrid engine and not the raw remeas potential.
[NEXT]: integrate CSPI as the asymptote cap into the Block 5 realized-reserve builder, run that 48-state, re-stress, then it is the dev->prod candidate.
```

## ADDENDUM 2: the asymptote cap CANCELS in the anchored reserve (decisive)

Integrated the CSPI cap into the realized-reserve builders behind the flag and tested both
the buggy mean-age version and the CORRECT per-plot calendar (ycx_reserve_realized_calendar.R,
#90). The cap mechanism is well-ordered (state scalars: ME 0.899, AZ clamped 0.800 [low
productivity, capped down], OR 1.069, FL 1.053, CA 1.032 [high, nudged up]).

But the realized reserve is **identical with the cap on or off**:

| State | CSPI scalar | realized reserve 2125, cap OFF | cap ON |
|---|---|---|---|
| ME | 0.899 | 489.5 Tg (2.21x t0) | 489.5 Tg (2.21x t0) |
| CA | 1.032 | 653.0 Tg (1.01x t0) | 653.0 Tg (1.01x t0) |
| AZ | 0.800 | 141.7 Tg (1.03x t0) | (identical) |

**Why (structural):** the reserve calendar is a t0-anchored multiplier,
reserve(year) = t0 * mean_plots Gsen(age) / mean_plots Gsen(age0). A uniform asymptote
scalar c multiplies Gsen everywhere, so it cancels exactly in the ratio: (c*X)/(c*Y) = X/Y.
A per-state (or per-cell, uniformly applied) CSPI cap on the asymptote LEVEL therefore has
zero effect on the anchored reserve trajectory. This is the root cause of every near-zero
reconciliation in this engine family: the small +/-0.4% per-state effect seen in the
canonical engine came only from DIFFERENTIAL per-cell scaling under area weighting, not from
the asymptote level itself.

**Decisive conclusion and redirect.** CSPI is real (generalizes +8.5% CV on remeas
asymptotes) and biologically well-ordered (Bakuzis PASS), but as an asymptote-LEVEL covariate
it is structurally neutralized by the t0-anchoring used throughout the production engines.
The asymptote-cap framing is the wrong lever. To deliver CSPI's validated value, apply it as
one of:
1. **Absolute / spatial level** (NOT anchored): the t0 carbon-density maps, TreeMap pixel
   expansion, and area model, where CSPI changes levels and does not cancel. This is the
   highest-value home (spatial accuracy of standing carbon).
2. **Curve SHAPE** (rate k or age-to-maturity), not the asymptote, since shape terms do not
   cancel in the t0-anchored ratio. Requires re-deriving CSPI against the rate, not the
   asymptote (the CV here validated the asymptote relationship, not a rate relationship).
3. **Cell-level differential** feeding an area-weighted sum (the canonical engine), accepting
   the small redistributive +/-0.4% effect.

Do NOT pursue the asymptote cap on the anchored reserve: it provably does nothing.

```
[CANCELLATION]: proven -- uniform asymptote scalar cancels in the t0-anchored reserve multiplier (ME/CA identical to 4 sig figs cap on vs off).
[REDIRECT]: CSPI belongs in the ABSOLUTE/spatial products (t0 density maps, area model) or as a curve-SHAPE term, not an asymptote cap on the anchored trajectory.
[STATUS]: PR #91 draft + Zenodo v1.2 staged remain correct holds; the asymptote-cap production path is closed by this result. Team decision: pursue CSPI on the spatial/t0 layer (recommended) or re-derive against curve rate.
```

## ADDENDUM 3: spatial t0 layer prototype (where CSPI is NOT cancelled)

Tested the recommended home directly. For each state, each plot's t0 carbon density is the
fitted curve at its stand age (baseline, uniform-by-area within cell); the CSPI version
multiplies each cell's density by its CSPI scalar and renormalizes within the state so the
FIA-anchored STATE TOTAL is preserved. The redistribution among cells (total-variation
distance, = fraction of the state's standing carbon moved):

| Metric | Value |
|---|---|
| states / cells | 48 / 2,203 |
| mean carbon redistributed | 2.09% |
| median | 1.44% |
| range | 0.32% to 6.32% |
| most redistributed | NE 6.3%, CA 5.0%, WA 4.9%, OR 4.9%, WI 4.7%, AZ 4.4% |

Reading: unlike the asymptote cap on the anchored reserve (exactly 0), CSPI moves a real,
non-zero amount of standing carbon on the absolute density layer, reallocating toward
productive cells while preserving FIA-anchored state totals. The magnitude is modest (~2%
mean, up to ~6% in large productivity-gradient states), which is the honest size of CSPI's
value: it improves sub-state spatial carbon accuracy by a few percent. This is CSPI's
production home.

## Final disposition of the CSPI investigation

- CSPI signal: REAL and generalizable on remeas asymptotes (+8.5% spatial CV), well-ordered
  (Bakuzis PASS), robust to knobs.
- Asymptote cap on the anchored reserve trajectory: provably ZERO effect (cancels in the
  t0-anchored multiplier). Closed.
- Canonical engine (area-weighted cell sum): tiny redistributive effect (+/-0.4%), t0-neutral.
- Spatial t0 density layer: NON-ZERO, ~2% mean (up to 6%) carbon reallocation toward
  productive cells, state totals preserved. RECOMMENDED production integration.

Production implementation (queued): wire `cspi_scalar` into the per-cell / per-TreeMap-pixel
t0 density in the raster/area builder (`ycx_build_rasters.R` and the area model), renormalized
to FIA state totals. Keep beta=1.0, clamp +/-25%. Re-run the Bakuzis site-ordering check on
the spatial product. PR #91 and Zenodo v1.2 stay staged; on team sign-off, this spatial
integration (not the asymptote cap) is what ships.

```
[SPATIAL_PROTOTYPE]: CSPI moves mean 2.09% (max 6.32%) of state standing carbon toward productive cells, totals preserved -- NON-ZERO, unlike the cancelled asymptote cap.
[FINAL]: CSPI production home = spatial t0 density allocation. Asymptote-cap path closed. Signal real (+8.5% CV), well-ordered (Bakuzis PASS), spatial value ~2%.
[NEXT]: wire cspi_scalar into ycx_build_rasters.R / area model per-pixel density (renorm to FIA totals); re-run site-ordering check; then it is the dev->prod candidate.
```

## ADDENDUM 4: CSPI-adjusted CONUS carbon-density raster (built)

`ycx_cspi_raster.py` bins per-plot modeled t0 carbon density (remeas curve at stand age) to a
0.25 deg CONUS grid server-side (coordinates stay on the cluster; only the gridded PNG/array
leaves), then applies the per-cell CSPI scalar renormalized within each state to preserve the
FIA-anchored state total. Outputs baseline, CSPI-adjusted, and difference maps.

- Grid 104x236, 10,764 filled cells; baseline density mean 58.4 Mg C/ha (max 588).
- CSPI reallocation: mean |diff| 3.6 Mg/ha; 6,996 cells move >1 Mg/ha; range -74 to +177.
- The difference map is biologically coherent: the productive Pacific Northwest coast and
  northern hardwood/Lake States gain carbon (up to +177 Mg/ha), the arid interior West and
  Southwest drylands lose it, with state totals preserved. This is correct site-productivity
  behavior and a visual confirmation of the spatial site-ordering relation.

Files: `cspi_raster_base.png`, `cspi_raster_cspi.png`, `cspi_raster_diff.png` (+ thumbs).
This is the working prototype of CSPI's production home. The production version replaces the
0.25 deg lon/lat binning with the explorer's Albers (EPSG:5070) replication and applies the
scalar per TreeMap pixel; the mechanism and renormalization shown here carry over unchanged.

```
[RASTER]: CSPI-adjusted CONUS carbon-density raster built; mean |reallocation| 3.6 Mg/ha, biologically coherent (PNW/northern hardwoods gain, interior West/SW lose), state totals preserved.
[CSPI INVESTIGATION COMPLETE]: signal real (+8.5% CV), well-ordered (Bakuzis PASS), asymptote-cap cancels (closed), spatial home demonstrated (~2% / 3.6 Mg/ha reallocation).
[PROD NEXT]: port the binning to Albers/TreeMap-pixel in ycx_build_rasters.R; that raster + the ycx_cell_cspi.csv covariate are the dev->prod CSPI deliverable.
```

## ADDENDUM 5: Albers (EPSG:5070) production port -- drop-in overlays

`ycx_cspi_raster_albers.py` ports the prototype to the explorer's exact overlay system:
EPSG:5070 Albers, extent x0 -2561585 / y1 1714610 / x1 2463176 / y0 -1604872.736, 20 km grid
(166x251), via pyproj. Emits bare overlay PNGs with alpha for nodata plus companion
`*_bounds.json` files in the explorer's convention (verified byte-identical to e.g.
conus_asym_agb_bounds.json), so they are drop-in for public/raster/.

- Grid 166x251 at 20 km, 6,786 filled cells; baseline mean 50.4 Mg C/ha (max 211.8);
  mean |CSPI reallocation| 2.40 Mg/ha.
- Geography verified: high carbon in the humid East/Appalachians, low in the arid West;
  CSPI reallocates toward productive sites. Albers projection renders correctly.
- Artifacts: out/conus_yc_agc_{base,cspi,cspidiff}.png (+ _bounds.json), and a labeled
  review panel conus_yc_cspi_albers_review.png.

Remaining for full production fidelity (blocked, separate): the 30 m TreeMap-pixel version
needs GDAL/terra, currently broken on Cardinal. The 20 km FIA-binned Albers product here is
the same resolution as the existing live hybrid overlays (conus_hybrid_agc2022) and is
deploy-ready by the same path. The CSPI thread is now complete end-to-end: covariate ->
validated signal -> structural finding -> spatial home -> production-projection overlays.

```
[ALBERS_PORT]: EPSG:5070 drop-in overlays + bounds.json built at 20km (matches live hybrid overlays); geography verified; mean reallocation 2.4 Mg/ha.
[DEPLOY PATH]: additive to gh-pages public/raster/ (same as existing overlays); gated on team beta/clamp sign-off + the source->deploy reconciliation noted in CONTRIBUTING.
[30m FIDELITY]: deferred -- needs GDAL/terra fix on Cardinal (known issue).
```
