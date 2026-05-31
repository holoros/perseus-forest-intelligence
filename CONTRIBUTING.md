# Contributing to PERSEUS Forest Intelligence

Thanks for the interest. A few project specific notes before you start.

## Read first: source vs deployed

The repository ships in two states right now.

* `main` carries the React + Vite + MapLibre **source** at app version v0.73.
* `gh-pages` carries the **deployed bundle** at app version v1.3, which is what
  https://holoros.github.io/perseus-forest-intelligence/ serves.

v1.3 features in the deployed bundle that are not yet in main source:

* "Upload AOI" top level button (.zip shapefile / .geojson upload, opens AOI tool with polygon preloaded)
* "Inspect point" click-to-query point inspector (lat/lon + state + EPA L3 ecoregion + ycx AGB at age 50)
* ycx year-slider animation (managed-harvest and reserve modes; EPA L3 polygons animate in lockstep)
* CSPI v3 canopy-height reference figure (OOB R^2 = 0.87, RMSE = 3.737 m, 58,475 training rows)

The Pages site currently deploys via direct push to the `gh-pages` branch
(repo Settings -> Pages -> Source: "Deploy from a branch", branch `gh-pages`).
That branch is built outside this main-branch source tree (likely from
Aaron's Fedora workstation) and pushed directly. The `.github/workflows/deploy-pages.yml`
workflow ships in this repo but is intentionally configured for
`workflow_dispatch:` only AND the Pages "Source" setting is intentionally NOT
GitHub Actions. Both safeguards must stay in place until the v1.3 source is
reconciled into main, otherwise running the workflow OR flipping the Pages
source would build from v0.73 main and overwrite the v1.3 gh-pages bundle.

Reconciliation procedure when ready (after all v1.3 features land in main):

1. Verify `npm run build` from main produces a bundle matching the deployed v1.3 features.
2. Flip Settings -> Pages -> Source to "GitHub Actions".
3. Change `.github/workflows/deploy-pages.yml` trigger from `workflow_dispatch:` to `push: branches: [main]`.
4. Tag a `v1.4-source` release matching the reconciled main.

The release tags `v0.73-source` (on main) and `v1.3-deployed` (on gh-pages)
anchor both states so they remain reachable as that reconciliation happens.

## Branching and commits

* Work on a feature branch off `main`, not directly on main.
* Use short imperative subjects under roughly 70 characters; one blank line; then context.
* If a change touches `public/api/` or `public/raster/`, note in the commit body which `perseus_db` script regenerated it and at what schema version (the canonical schema is in `public/api/meta.json` under `schema:`).

## Running locally

```
npm install
npm run dev      # http://localhost:5173 (Vite)
npm run build    # static bundle -> dist/ (do not push dist/ to main; gh-pages is the deploy target)
```

## Refreshing data from `perseus_db`

The export pipeline lives in the upstream `perseus_db` repo. To refresh:

1. `python3 scripts/48_export_api.py .` from `perseus_db`
2. `cp -r perseus_db/api/* public/api/`
3. Re-run `perseus_db/scripts/50_raster_image_overlays.sh` if spatial inputs changed and copy `public/raster/`
4. Commit and push to main (current settings will not auto-deploy; see workflow note above)

## Submitting changes

* Open a pull request against `main`, not gh-pages.
* Describe the data version touched and any engine/methods doc updates needed.
* If your change reconciles main with the gh-pages v1.3 features, call that out explicitly in the PR title so the workflow trigger can be flipped back at merge time.

## Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`. If the issue is about the
source/deploy desync, tag it with `desync`.

## Contact

Aaron Weiskittel, University of Maine, aaron.weiskittel@maine.edu
