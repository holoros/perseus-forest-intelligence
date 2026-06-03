# ADR 0002: Recalibrate near-term yield-curve growth to the FIA longitudinal record

Status: ACCEPTED and IMPLEMENTED (deployed v1.4, 2026-06-02)
Date: 2026-06-02
Deciders: A. Weiskittel + PERSEUS team
Supersedes: nothing. Extends the validation in `docs/hybrid_validation_vs_fia.md`.
Superseded-in-part: the model-form/ratio-apply of the FIA AGC engine is replaced by the direct hybrid re-projection in ADR 0003 (v0.56, 2026-06-03); the recalibration kernel and scenario design here are retained.

> Implemented in v1.4 (`release/recal-disturb-v1.4`, deployed to gh-pages): the
> approved **agedist + physical-ceiling** recalibration is applied to the YC
> empirical engine via `ycx_apply_recal_disturb.R` -> `ycx_merge_perseus.py`
> (mean growth uplift 1.44x by 2125, capped 2.0 for sparse states; t0 anchoring
> preserved). A new `reserve (no harvest, disturbance-exposed)` scenario ships
> alongside (see `docs/results/disturbance_decline_scenario.md`).

## Context

ADR 0001 promoted the FIA-anchored hybrid (`yc_hybrid_v1`) to the production
yield form. The follow-up validation (`hybrid_validation_vs_fia.md`) found the
engine reproduces the **geography** of productivity well (spatial r = 0.78 across
48 states) but carries a **conservative near-term bias of −0.68 %/yr** (engine
1.01 %/yr vs observed 1.68 %/yr; every state below the 1:1 line). That doc left
the *cause* open. This ADR closes it.

The hybrid, like every age-based yield curve, is fit to a **chronosequence**:
stands of different ages observed once, treated as one trajectory (space-for-
time substitution). The unbiased alternative is the **longitudinal** signal —
the same plots remeasured ~5–10 yr apart. We computed both, by stand-age class,
on 272,356 undisturbed FIA remeasurement plots (CONUS, `reserve`-analogue:
latest-visit treatment "untreated", REMPER 3–15 yr).

| age class | n | mean age | standing AGC (Mg C/ha) | obs net growth (Mg C/ha/yr) | obs %/yr |
|---|---:|---:|---:|---:|---:|
| 0–20 | 43,477 | 13 | 20.5 | 0.833 | 4.07 |
| 20–40 | 59,153 | 31 | 34.7 | 1.612 | 4.65 |
| 40–60 | 58,344 | 51 | 50.0 | 1.156 | 2.31 |
| 60–80 | 53,798 | 71 | 63.3 | 0.984 | 1.56 |
| 80–100 | 31,683 | 89 | 71.1 | 0.871 | 1.23 |
| 100–120 | 11,573 | 109 | 71.8 | 0.649 | 0.90 |
| 120+ | 14,328 | 181 | 69.4 | 0.308 | 0.45 |
| pooled | 272,356 | — | 49.0 | 1.070 | 2.19 |

Source: `scripts/yield_curve_engine/ycx_ingrowth_gap.R`,
`docs/results/ingrowth_by_age.csv`.

## Finding

The **chronosequence local slope** (dC/da from the standing-AGC column) is about
**half** the **observed longitudinal increment** at young-to-mid ages, and the
two only narrow at old age:

| age band | chronosequence slope dC/da | observed increment | obs / chrono |
|---|---:|---:|---:|
| ~30 | 0.78 | 1.61 | 2.1× |
| ~50 | 0.72 | 1.16 | 1.6× |
| ~70 | 0.56 | 0.98 | 1.8× |
| ~90 | 0.22 | 0.87 | ~4× |
| ~110 | ~0.0 | 0.65 | curve flat, plots still growing |
| ~180 | <0 | 0.31 | curve declining, plots still growing |

![chronosequence vs longitudinal growth](results/ingrowth_chronosequence_gap.png)

The standing-AGC chronosequence **plateaus near 70 Mg C/ha by age ~90 and is flat
to declining thereafter**, while the remeasurement increments stay positive
(+0.3 to +0.65 Mg C/ha/yr) well past age 120. The cross-section flattens too
early because **older stands in the snapshot sit on systematically poorer or
more disturbance-shaped sites** (a survivorship/site confound): the best young
stands do not persist as the oldest observed stands, so marching the curve
forward under-projects real accumulation. The longitudinal increment follows the
*same* plot through time and does not carry that confound — it is the unbiased
truth. Integrated over the age-mixed current inventory, the slope deficit is
exactly the **−0.68 %/yr** the validation flagged.

Two mechanisms compound the deficit, both pushing the same direction:
1. **Site/survivorship confound** (above) — the dominant term, present at every
   age below culmination.
2. **No ingrowth** — age-based curves project the *current* tree list forward and
   structurally omit recruitment of new stems across the measurement threshold,
   most material in young stands.

Critically, the hybrid's **old-age behavior is correct**: where the curve
culminates and the senescence tail engages (age 100+), the observed increment is
genuinely small and falling. The bias is a **young-to-mid-age slope** problem,
not an asymptote problem — so the fix must lift near-term growth **without**
disturbing the culmination age or the decline tail that ADR 0001 was chosen for.

## Decision (proposed)

Recalibrate the hybrid's **near-term increment** (first ~20 projected years) to
the FIA longitudinal remeasurement record, per forest-type × ecoregion × owner
cell where remeasurement n permits, falling back to the CONUS age-class curve
above where a cell is data-poor. Concretely:

1. Fit observed net-increment-vs-age from remeasurement (the green curve above),
   stratified to the production cells with partial pooling (same `lmer`
   machinery as `ycx_hybrid_fit.R`), as an **increment** model g_obs(age).
2. For each cell, blend the projected annual increment over the first 20 yr
   toward g_obs(age) — weight 1.0 near t0 decaying to 0 by the cell's
   culmination age A* — then hand back to the existing hybrid trajectory (which
   already matches reality at and beyond culmination). This preserves t0
   anchoring, A*, and the senescence tail untouched.
3. Re-validate against the held-out remeasurement record; target is to bring the
   pooled bias from −0.68 %/yr to within ±0.15 %/yr while keeping spatial r ≥
   0.78 and not raising 100-yr reserve totals beyond the observed envelope.

This is a **growth-rate recalibration**, not a model-form change: peak-decline
vs hybrid is settled by ADR 0001 and not reopened.

## Consequences

- **Higher near-term reserve growth and 100-yr accumulation.** The current
  CONUS reserve t0→t100 of 10,002 → 11,794 Tg C is biased low; correcting the
  young-to-mid slope raises the trajectory. Magnitude to be reported with the
  implementation PR; expect the largest lift in young, productive, actively
  managed Eastern strata, little change in old Western reserve strata.
- **Managed/HWP scenarios shift too** (they share the growth kernel), so product
  and net-carbon series must be regenerated together, as in ADR 0001's PR #19.
- **Uncertainty widens slightly** where remeasurement n is thin; the blend's
  fallback to the pooled curve bounds this.
- **No change to model form, anchoring method, or scenario structure.** The
  explorer stays hybrid-consistent.

## Cell-level fit + stress test (built 2026-06-02)

The recalibration was implemented at the **ft × eco × owner cell** level the
decision calls for (`scripts/yield_curve_engine/ycx_recal_cell.R`, Cardinal job
11210987): g_obs fit per cell with fallback cell → ft_group → state → national
(548 cell / 27 ft / 46 state models from 272,356 remeasurement plots), re-projected
over the TreeMap-2022 reserve, with the full robustness battery.

CONUS reserve carbon (Tg C), by increment-blend weight scheme:

| variant | t0 | t100 | 100-yr gain | near-term bias %/yr | spatial r |
|---|---:|---:|---:|---:|---:|
| production hybrid | 11,607 | 13,701 | +18.0% | −0.68 | 0.78 |
| `agedist` (full to A*) | 11,607 | 18,752 | +61.6% | −0.39 | **0.84** |
| `agedist` + physical ceiling | 11,607 | 17,722 | +52.7% | −0.41 | **0.84** |
| `time20` (first 20 yr only) | 11,607 | 17,869 | +54.0% | **−0.18** | 0.81 |
| `full` (no weight decay) | 11,607 | 22,062 | +90.1% | −0.05 | 0.78 |

![stress test](results/recal_cell_stress.png)

Robustness checks:
- **(A) Held-out 5-fold CV.** g_obs predicts held-out remeasurement increments at
  RMSE 2.20 vs 2.37 for the hybrid chronosequence slope (7% lower). Per-plot
  increments are intrinsically noisy (σ ≈ 2 on a ~1 Mg C/ha/yr mean), so the
  win is modest per plot; the correction's value is in removing the *systematic*
  low bias, not in plot-level prediction.
- **(B) Weight-scheme sensitivity** (table). The lift is monotone in how far the
  observed increment is allowed to act. `full` closes the bias but adds no
  spatial skill (r stays 0.78) and pushes a +90% century gain — too aggressive.
- **(C) Physical ceiling.** Capping corrected standing density at each cell's
  95th-percentile observed standing AGC trims the century total from +61.6% to
  +52.7% — no pixel is projected past what FIA actually observes for that stratum.
- **(D) Senescence preservation.** By construction the weight is 0 for any stand
  at/after its culmination age A*, so already-mature pixels are unchanged (the
  automated check's "mismatches" are floating-point reconstruction noise < 1e-7
  Mg C/ha from the cumsum, not real changes). The ADR-0001 decline tail is intact.
- **(E) Bootstrap.** Resampling plots and refitting g_obs (40×) gives a CONUS
  t100 of 18,770 Tg C, 95% CI [18,729, 18,836] — a ±0.4% band reflecting g_obs
  sampling error only (it excludes hybrid-parameter and anchoring uncertainty).

The cell-level spatial r lands at **0.84**, below the state-level prototype's 0.92.
The prototype number was optimistic: a per-state smoother encodes each state's
mean observed growth, which is also the validation target (mild circularity). The
cell-level fit removes that and 0.84 is the honest improvement over 0.78.

**Recommended production setting: `agedist` with the physical ceiling.** It is the
principled middle — senescence-safe, bounded by observed standing carbon, halves
the bias (−0.68 → −0.41), lifts spatial skill (0.78 → 0.84), and yields a
defensible +52.7% century reserve gain. `time20` is the conservative alternative
if minimizing the near-term bias (−0.18) matters more than long-run realism.

Artifacts: `scripts/yield_curve_engine/ycx_recal_cell.R`,
`docs/results/recal_cell_{validation,state_delta,report}` and
`conus_recal_cell_100yr.csv`, `docs/results/recal_cell_stress.png`.

## Status of this PR

Documentation + read-only diagnostic only. It adds this ADR, the analysis
script, the age-class table, and the figure. **It does not modify any series,
`fia.json`, `meta.json`, or the deployed build.** Implementing the recalibration
(steps 1–3) is a separate, reviewed PR pending Aaron's sign-off, since it changes
production carbon totals.

## Artifacts

- `scripts/yield_curve_engine/ycx_ingrowth_gap.R` — age-class decomposition (this run)
- `scripts/yield_curve_engine/ycx_validate_obs.R` — per-state observed growth (ADR 0001 follow-up)
- `docs/results/ingrowth_by_age.csv` — the age-class table above
- `docs/results/ingrowth_chronosequence_gap.png` — the two-panel figure
