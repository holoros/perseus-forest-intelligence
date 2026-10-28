# FIA plot coordinates in `public/api/fia_plots/`

The six `fia_plots/{ST}.json` files (GA, IN, ME, MN, OR, WA) carry one row per FIA plot
with `lat`, `lon`, inventory year, stand age, live basal area, forest type and owner group.
They feed the AOI report's plot sample and nothing else.

## What the coordinates are

The latitude and longitude come from the public FIADB `PLOT.LAT` and `PLOT.LON` fields.
The Forest Service publishes those values only after two disclosure protections required
by the Food Security Act of 1985 as amended (7 U.S.C. 2276(d)):

- **Perturbation ("fuzzing").** Public coordinates are moved from the true location, within
  about 0.8 km for most plots and up to about 1.6 km for a small subset.
- **Swapping.** For a subset of plots on private land, coordinates are exchanged with those
  of an ecologically similar plot in the same county.

These are therefore approximate positions suitable for area summaries, not plot locations.
True FIA coordinates are restricted under FIA data agreements. They are never stored in,
processed for, or published through this repository; any analysis that needs them runs on
the restricted server and only aggregated products reach `public/api/`.

## Precision

The files previously stored coordinates to four decimal places (about 11 m), which implies
far more accuracy than perturbed values can carry. Since v1.38.0 (Phase 0 cleanup) they are
rounded to 0.01 degree (about 1.1 km in latitude), on the order of the perturbation itself.
Each file's `meta` block records `coord_precision_deg: 0.01` and a `coord_note` saying the
values are perturbed public FIADB coordinates.

## Use in the app

The AOI report counts and summarizes plots that fall inside, or near, a drawn area. With
perturbed and rounded coordinates, plot membership near an AOI boundary is uncertain, and
the report's plot statistics should be read as a regional sample rather than an exact
inventory of the drawn polygon.

## Regeneration

The files were produced outside this repository from state `PLOT.csv` and `COND.csv`
downloads (most recent INVYR, area weighted). Any regeneration must keep the 0.01 degree
rounding; the CI check `scripts/check_api_integrity.py` enforces it.
