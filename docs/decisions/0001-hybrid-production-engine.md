# ADR 0001: Promote the FIA-anchored hybrid to the production yield form

Status: ACCEPTED and IMPLEMENTED
Date: 2026-05-31
Deciders: A. Weiskittel + PERSEUS team

> Implemented: carbon phase in PR #18 (yc_hybrid_v1 is the default agc_live_total
> line, peak-decline kept as comparison; meta.default_models set); products + net
> carbon regenerated on the hybrid engine in PR #19. Anchoring validated
> (reserve t0 = 10,002, t100 = 11,794). The explorer is now hybrid-consistent.
> Peak-decline remains available as a labeled comparison line for one release.

## Context

The production yield-curve engine (`ycx_01_curves.R`) currently fits the
peak-decline form `y = b1 * age^b2 * b3^age` per forest-type x ecoregion x owner
cell. It was chosen to bound 100-year accumulation, but a 48-state 5-fold CV
stress test (AG carbon, lb/ac) shows it is the worse-fitting form:

| Form | Pooled CV RMSE |
|---|---|
| Chapman-Richards `A(1-exp(-k*age))^p` | 23,420 (best) |
| Hybrid: CR + decline tail beyond empirical A* | 26,419 |
| Peak-decline (current production) | 27,480 |
| Re-anchored peak-decline | 27,774 |

The hybrid (CR growth up to a per-cell empirical culmination breakpoint A*, then
an exponential decline tail) equals CR where culmination is beyond the data and
adds senescence where forests culminate earlier. It has now been fit in
production for all 48 states (`ycx_hybrid_fit.R`), projected spatially
(`ycx_treemap_hybrid.R`), and FIA-anchored (`ycx_hybrid_anchor.R`, per-state
scalar median 0.86) so its 2022 standing carbon matches the production baseline.

## Decision (proposed)

Promote the FIA-anchored hybrid (`yc_hybrid_v1`) to be the default production
yield form, replacing peak-decline, after the validation steps below pass.

## Consequences

Anchored to the same 2022 standing carbon (CONUS 10,002 Tg), the hybrid diverges
progressively below peak-decline as senescence engages:

| Year | peak-decline (Tg C) | hybrid, anchored (Tg C) | diff |
|---|---|---|---|
| 2022 | 10,002 | 10,002 | 0% |
| 2052 | 12,858 | 12,511 | -2.7% |
| 2082 | 14,170 | 12,987 | -8.4% |
| 2102 | 14,585 | 12,513 | -14.2% |
| 2122 | 14,813 | 11,794 | -20.4% |

The change lowers the projected 100-year old-forest carbon by ~20% at the CONUS
scale. Because carbon, biomass, products, and the four management scenarios all
derive from the same per-cell fits, ALL of those published trajectories shift,
not just reserve carbon. This is the headline reason the swap needs sign-off
rather than an autopilot merge: it changes every number the explorer shows.

## Implementation checklist (on approval)

1. Make `ycx_hybrid_fit.R` the per-cell fitter for every response (not just
   carbon): emit hybrid params (A, k, p, d, Astar) for agb_tonac, vol, merch,
   etc., replacing the peak-decline a/b/c in `ycx_<ST>_fits.csv`, OR add a
   `form` column and dual-write so downstream can select.
2. Update the curve evaluator everywhere it appears (`ycx_02_perseus.R`,
   `ycx_treemap_project.R`, `ycx_treemap_scenarios.R`, `ycx_treemap_products*.R`)
   from `chap(age,a,b,c)=a*age^b*c^age` to the hybrid
   `A*(1-exp(-k*age))^p*exp(-d*max(0,age-Astar))`.
3. Apply the FIA anchoring inside the pipeline (fold `ycx_hybrid_anchor.R`'s
   per-state scalar into the projection, or re-derive A0 against fia.json) so
   t0 reproduces the FIA carbon anchors by construction.
4. Regenerate all 48-state fits + re-run perseus + all TreeMap projections
   (carbon, scenarios, products) on Cardinal.
5. Re-merge the refreshed series into the PERSEUS api; bump db_version.
6. VALIDATE: per-state t0 vs fia.json within tolerance; CONUS reserve t0 = 10,002;
   spot-check 5 states; confirm products and scenarios still sum consistently.
7. Update methods notes; keep peak-decline available as a comparison line
   (`yc_fia_empirical_v1` / a `yc_peakdecline_v1`) for one release.

## Rollback

The swap is data-regenerable: retain the peak-decline fits and the current api
snapshot (tag `pre-hybrid-swap`). Reverting is re-merging the peak-decline
series. No live deploy is affected until the gh-pages data is updated, which is
a separate, reversible step.

## Current status of the building blocks (already in repo / live)

- Hybrid fitter, spatial projection, anchoring, and `yc_hybrid_v1` line: done,
  merged (PRs #11, #12), live as an additive comparison line.
- HWP net-flux layer: done (PR #11), methods note live.
- What remains is only the production DEFAULT swap (steps 1-7 above), gated on
  this ADR's approval.

## References

- Methods note: /methods/hybrid-production-hwp/
- Scripts: scripts/yield_curve_engine/ycx_hybrid_fit.R, ycx_treemap_hybrid.R,
  ycx_hybrid_anchor.R; results in docs/results/
