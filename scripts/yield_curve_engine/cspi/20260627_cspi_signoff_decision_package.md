# CSPI beta/clamp sign-off: decision package

*2026-06-27. Packages the remaining CSPI decision so it collapses to one low-stakes call.*

## The reframe: this sign-off is lower-stakes than it looked

The stress test proved that a uniform asymptote scalar **cancels** in the t0-anchored reserve
multiplier (ME/CA realized reserve identical with the CSPI cap on vs off). Consequence:

- **beta and clamp do NOT change any published trajectory number.** On the anchored carbon/
  biomass/product trajectories they are a mathematical no-op.
- They affect **only** the magnitude of the spatial t0 redistribution (mean ~2%, up to ~6%,
  totals preserved), i.e., how much standing carbon is reallocated toward productive cells on
  the density maps. That is bounded by the clamp and well-ordered (Bakuzis PASS).

So the decision is not "does CSPI change our numbers" (it does not, on the trajectory). It is
"how strong should the spatial productivity adjustment be on the density layer," with a safe,
bounded default already in hand.

## Recommendation

1. **Do not promote CSPI on the anchored trajectory** (asymptote cap). It is provably inert;
   adding it would be complexity with no effect. Close that path.
2. **Adopt CSPI on the spatial density layer** with **beta = 1.0, clamp +/- 25%** as the
   default. It changes no published trajectory number, redistributes ~2% of standing carbon
   toward productive sites, is biologically well-ordered, and is reversible (flag/clamp).
3. **Defer per-cell SDImax and the 30 m density render** as refinements; not needed to adopt.

Under this framing the sign-off can be a quick yes to the default, because the downside is
bounded and nothing published moves.

## Push-button execution runbook (on "go")

1. **Merge PR #91** (holoros/perseus-forest-intelligence, `feature/cspi-asymptote-covariate`).
   It is mechanism + provenance + ADR 0005 + stress memo; no live-data regen in the PR itself.
2. **Deploy the CONUS CSPI overlay** additively to gh-pages `public/raster/`:
   `out/conus_cspi_scalar.png` + `_bounds.json` (drop-in, matches the existing overlay
   convention). Follow the additive-to-gh-pages path in CONTRIBUTING (do NOT deploy main).
3. **Publish Zenodo v1.2.0:** from `zenodo_staging/perseus-yield-curves/v1.2/` on Cardinal:
   `python new_version.py --token-file ~/.zenodo_token --parent-doi 10.5281/zenodo.20959003 \
   --metadata zenodo_metadata.json --files-list files_to_upload.txt --publish`
   (copy new_version.py from the zenodo-deposit skill scripts/ first).
4. **Backfill the minted v1.2 DOI** into ADR 0005, the README, and CITATION.cff; commit.

Each step is prepared; total hands-on time is minutes.

## Draft note to the team (requesting the sign-off)

> Subject: CSPI site-productivity layer -- quick sign-off (low stakes)
>
> Team -- the CSPI site-productivity work is done and stress-tested. One finding simplifies the
> decision: on our anchored carbon/biomass trajectories, scaling the curve asymptote by CSPI
> cancels out mathematically (we verified state trajectories are identical with it on or off).
> So CSPI does not change any published trajectory number.
>
> Where it does add value is the spatial layer: it reallocates about 2% of each state's standing
> carbon toward more productive sites on the density maps, with state totals preserved and
> biologically sensible ordering (productive East gains, arid West loses). The adjustment is
> bounded (max +/- 25% per cell) and reversible.
>
> I recommend we adopt it on the density layer with the default settings (proportional, +/- 25%
> cap). It is drop-in (EPSG:5070 overlay ready), changes no published number, and improves
> sub-state spatial accuracy. If you are good with the default, I will merge the (draft) PR,
> deploy the CONUS overlay, and publish the dataset update (Zenodo v1.2). Details and the
> stress test are in the assessment memo. -- Aaron

(Drafted for Aaron to send/edit; the email-drafter skill can tailor tone and recipients.)

```
[SIGNOFF_REFRAME]: beta/clamp are a no-op on published trajectories (asymptote cancels); they only tune the bounded ~2% spatial redistribution. Low stakes.
[RECOMMENDATION]: adopt CSPI on the spatial density layer at beta=1.0/clamp 25%; do not promote on the anchored trajectory.
[READY]: merge #91 + deploy CONUS overlay + publish Zenodo v1.2 -- runbook + draft team note prepared; minutes of hands-on once approved.
```
