# Deep CSPI assessment: is it worth promoting, and how (2026-06-28)

*Three decision-critical out-of-sample tests on the remeasurement cell asymptotes, leave-one-
ecoregion-out CV within forest type. 656 cells, covariates sampled at public plot coords
(212,364 samples). Decides the CSPI next steps. Companion to the earlier stress assessment.*

## T2: CSPI vs simpler covariates — CSPI is NOT redundant

Held-out CV skill for predicting the cell log-asymptote (improvement over a forest-type-mean
baseline):

| Covariate | held-out RMSE | vs baseline | within-ft r |
|---|---|---|---|
| **CSPI** | 0.796 | **+8.4%** | +0.39 |
| ClimateNA site index | 0.860 | +0.9% | -0.06 |
| Latitude | 0.836 | +3.7% | +0.24 |

The existing ClimateNA SI product has **essentially no skill** (+0.9%, r near 0) for the
yield-curve asymptote; latitude has a little; CSPI clearly leads. CSPI is not a repackaging of
information already on hand.

## T3: CSPI adds over the existing SI — fully independent signal

Within-forest-type partial correlation of log-asymptote with log-CSPI, **controlling for
ClimateNA SI**: +0.41 (n=643) — essentially unchanged from the raw +0.39. Conditioning on SI
removes none of CSPI's signal. CSPI's predictive content is independent of, and far larger
than, the existing site-index layer.

## T1: optimal beta — the data supports a HIGHER beta than 1.0

Held-out relRMSE of the asymptote when scaled by (CSPI/median)^beta vs a flat ft-mean:

| beta | held-out improvement |
|---|---|
| 0.5 | +3.5% |
| 1.0 | +6.5% |
| 1.5 | +8.8% |
| 2.0 | +10.5% |
| 2.77 (free slope) | +11.5% |

Out-of-sample skill rises monotonically with beta. **This refutes my earlier call.** I had set
beta=1.0 and dismissed the free slope (~2.77) as confound-amplified; the leave-one-ecoregion-out
CV shows the steep slope generalizes best, so the steepness is real predictive signal, not a
confound. The marginal gain flattens beyond ~2.0 (2.0 gets +10.5%, free +11.5%), so beta ~1.5 to
2.0 captures nearly all the skill with less extrapolation risk.

## Decision and next steps

1. **Promote CSPI — it is genuinely valuable and non-redundant.** It carries real, out-of-sample
   productivity signal for the asymptote (+8 to +11%) that no available covariate provides
   (ClimateNA SI +0.9%, latitude +3.7%), and that signal is independent of SI.
2. **Use beta ~1.5 to 2.0 on the SPATIAL layer, not 1.0.** The CV-optimal beta is higher than the
   conservative default; raise it to ~1.5-2.0 and widen or drop the +/-25% clamp accordingly
   (the clamp was a safety bound the data now says is too tight). Recommend beta=1.5 as the
   skill/robustness balance, or 2.0 to maximize spatial accuracy.
3. **The structural finding still holds:** a uniform asymptote scalar cancels in the t0-anchored
   reserve trajectory, so beta only affects the ABSOLUTE/spatial product (the density maps), not
   the anchored carbon trajectory. So CSPI's home remains the spatial density layer, now with a
   stronger, evidence-based beta.
4. **Do not block on alternatives.** Since SI has no skill here, there is no simpler substitute;
   CSPI is the covariate to use.

Concrete next action when promoting: rebuild the CONUS CSPI spatial overlay (ycx_cspi_conus_overlay.py)
at beta=1.5 (and a wider clamp, e.g. [0.7,1.45]), regenerate the spatial redistribution and the
30m product on that beta, and use that as the production CSPI layer. Optionally re-derive the
asymptote-cap calibration directly from the free CV slope per forest type.

```
[DEEP_ASSESS]: CSPI out-of-sample skill +8.4% (asymptote), beats ClimateNA SI (+0.9%) and latitude (+3.7%); independent of SI (partial r +0.41). Optimal beta 1.5-2.0 (CV rises monotonically), NOT the conservative 1.0.
[DECISION]: promote CSPI on the spatial density layer at beta~1.5-2.0, widen/drop the clamp; no simpler covariate substitutes. Anchored-trajectory cancellation unchanged.
[NEXT]: rebuild the CONUS + 30m CSPI overlays at beta=1.5; optionally per-ft CV-calibrated slope.
```
