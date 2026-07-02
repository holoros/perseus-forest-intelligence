# Contributing to PERSEUS Forest Intelligence

Thanks for the interest. A few project specific notes before you start.

## How deployment works

The `main` branch is the single source of truth for both the code and the
deployed site. Every push to `main` is built and published to GitHub Pages by
`.github/workflows/deploy-pages.yml` (Pages Source: "GitHub Actions"), so
https://holoros.github.io/perseus-forest-intelligence/ always reflects the
latest `main`. `npm run build` from `main` reproduces the deployed bundle.

The earlier source-vs-deploy split (source `v0.73`, deployed `v1.3`, with the
deploy workflow gated to `workflow_dispatch` only) has been fully reconciled;
that guidance no longer applies. The `v0.73-source` and `v1.3-deployed` tags
remain only as historical anchors.

Because a merge to `main` deploys straight to production, keep changes on a
feature branch and open a pull request; let the `build` check pass before
merging.

## Branching and commits

* Work on a feature branch off `main`, not directly on main.
* Use short imperative subjects under roughly 70 characters; one blank line; then context.
* If a change touches `public/api/` or `public/raster/`, note in the commit body which `perseus_db` script regenerated it and at what schema version (the canonical schema is in `public/api/meta.json` under `schema:`).

## Running locally

```
npm install
npm run dev      # http://localhost:5173 (Vite)
npm run build    # static bundle -> dist/ (dist/ is git-ignored; CI builds and deploys from main)
```

## Refreshing data from `perseus_db`

The export pipeline lives in the upstream `perseus_db` repo. To refresh:

1. `python3 scripts/48_export_api.py .` from `perseus_db`
2. `cp -r perseus_db/api/* public/api/`
3. Re-run `perseus_db/scripts/50_raster_image_overlays.sh` if spatial inputs changed and copy `public/raster/`
4. Open a PR to main; on merge, CI builds and auto-deploys the refreshed data

## Submitting changes

* Open a pull request against `main`.
* Describe the data version touched and any engine/methods doc updates needed.
* Let the `build` check pass before merging; merging deploys to production.

## Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`.

## Contact

Aaron Weiskittel, University of Maine, aaron.weiskittel@maine.edu
