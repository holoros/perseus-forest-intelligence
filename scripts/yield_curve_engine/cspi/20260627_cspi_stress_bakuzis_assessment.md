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
