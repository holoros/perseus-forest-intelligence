# ADR 0003: Swap the FIA AGC engine to the FIA-plot hybrid + recalibration form

Status: ACCEPTED and IMPLEMENTED (deployed v0.56, 2026-06-03)
Date: 2026-06-03
Deciders: A. Weiskittel + PERSEUS team
Supersedes: the model-form aspect of ADR 0001/0002 for `yc_fia_empirical_v1`
`agc_live_total` only. The recalibration kernel and disturbance/mortality
scenario design from ADR 0002 are retained and reused.

> Implemented in v0.56 (PR #39, squash-merged to main, Pages deploy green):
> `yc_fia_empirical_v1` `agc_live_total` is replaced across all 12 scenario
> buckets, 48 states + US, by the FIA-plot inventory projected on the hybrid
> form with the agedist + 95th-pct ceiling recalibration. CONUS reserve moves
> from the peak-decline +112% to +63%. Per-state t0 (2025) anchor preserved.

## Context

The dashboard carried three AGC engines that did not share a model form:

- `yc_hybrid_v1`: hybrid Chapman-Richards + decline tail, no recalibration
  (CONUS reserve +18%, biased low on near-term increment).
- `yc_treemap_spatial_v1`: peak-decline form on TreeMap 2022 pixels, no
  recalibration (+48%).
- `yc_fia_empirical_v1`: peak-decline form on FIA plots, agedist+ceiling
  recalibration applied as a ratio on top of the peak-decline base (+112%).

The FIADB vs TreeMap reconciliation (`docs/results`, `fig_reconciliation`)
isolated inventory basis from model form by running the *same* hybrid+recal on
both inventories. Result: FIA plots +70% vs TreeMap pixels +53% at the kernel
level, an inventory-basis range of roughly 8% at t100. The deployed +112% FIA
line was therefore a **model-form artifact** (peak-decline keeps accumulating
old-stand carbon), not an inventory signal. With FIA on peak-decline and the
others on different forms, the "inventory range" band between the FIA and
TreeMap lines was not interpretable.

## Decision

Re-project the FIA-plot inventory directly on the hybrid + recalibration form,
abandoning the peak-decline x ratio apply for `agc_live_total`:

- Hybrid form `A*(1-exp(-k*age))^p*exp(-d*max(0,age-A*))` per cell
  (ft_group x EPA-L3 province x owner), partial-pooled fits.
- agedist + ceiling recalibration: blend the hybrid increment toward the FIA
  longitudinal `g_obs` kernel with weight `w=(A*-age)/A*` decaying to 0 at
  culmination, capped at the 95th-pct observed standing carbon per cell.
- Raster fire/insect disturbance (`p_dist . severity . density`) and GRM
  density mortality `m(C)` as the disturbance-exposed and mortality-stressed
  arms; owner-rotation harvest (Industrial clearcut R=45; NIPF/State/Public
  partial) for the managed/intensive/conservation regimes.
- Uniform-grid A0 anchoring, then a per-state continuity rescale to the prior
  `yc_fia_empirical_v1` t0 so the line stays continuous with its own history
  and with siblings (only the post-t0 trajectory shape changes).

Implemented as a vectorized 100-year march over the 622,807-plot CONUS vector
(`ycx_fia_hybrid_fullseries_vec.R`, ~13 min on Cardinal) feeding a JSON node
injector (`ycx_inject_hybrid.py`). The original per-plot scalar loop
(`ycx_fia_hybrid_fullseries.R`) was abandoned after a 45-min walltime timeout
(~1.2B interpreted iterations).

## Consequences

- CONUS reserve (no harvest): 11,061 -> 17,997 Tg C (**+63%**, was +112%),
  matching the form of `yc_treemap_spatial_v1` (+48%). The FIA vs TreeMap spread
  now reads as a **true inventory-basis range**, not a model-form difference.
- Scenario behavior (CONUS, t0 -> t100): disturbance-exposed reserve -15%,
  mortality-stressed reserve +42%, managed harvest -38%, intensive -65%,
  conservation +18%. Declines without active management are surfaced.
- **Scope limit:** only `agc_live_total` is swapped. `agb_dry`, `vol_stem`, and
  the merch metrics remain on the peak-decline empirical-curve basis (volume and
  merch lack hybrid fits; biomass has `agb_tonac` hybrid fits but is not yet
  projected). These metrics now disagree in form with carbon; bringing at least
  biomass onto the hybrid basis is the recommended follow-on.
- The FIA empirical engine keeps its own t0 anchor, which sits below the
  TreeMap/hybrid t0 in some states. Reconciling all three to a common t0 is a
  separate anchor-reconciliation pass, not done here.

## Artifacts

- `scripts/yield_curve_engine/ycx_fia_hybrid_fullseries_vec.R` - vectorized
  full-series projection (12 buckets x 48 states, AGC Tg with lo/hi bands).
- `scripts/yield_curve_engine/ycx_inject_hybrid.py` - node injector with
  per-state t0 continuity rescale and US re-sum.
- `treemap/recal_cell/fia_hybrid_fullseries_agc.csv` - the per-state series.
