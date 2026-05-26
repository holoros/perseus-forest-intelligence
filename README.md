# PERSEUS Forest Intelligence

CONUS multi-model forest-carbon explorer for the PERSEUS focal states (Maine, Indiana, Georgia). Pick a state, drill into multi-model growth curves with uncertainty ribbons and the FIA above-ground reference; toggle the LANDIS biomass spatial layer for Maine (total + balsam fir, red spruce, red maple, pine).

Built on the perseus_db v0.55 carbon-pool-harmonized database. Static React + Vite + MapLibre, deployed via GitHub Pages.

## Develop / build

```
npm install
npm run dev        # local dev server
npm run build      # static bundle -> dist/
```

## Refresh data

The `public/api/` JSON and the `public/raster/` overlays are exported from the upstream perseus_db. To refresh after a DB change:

1. From `perseus_db` (upstream repo): `python3 scripts/48_export_api.py .`
2. Copy: `cp -r perseus_db/api/* path-to-this-repo/public/api/`
3. Re-run `scripts/50_raster_image_overlays.sh` if the spatial inputs changed and copy `public/raster/`.
4. Commit + push; the GitHub Actions workflow rebuilds and redeploys.

## Deploy

`.github/workflows/deploy-pages.yml` deploys on every push to `main`. One-time: Settings -> Pages -> Source: GitHub Actions.

## What's in here

- CONUS choropleth (engines per state); focal ME/IN/GA highlight.
- Multi-model growth curves with metric + management controls, FIA reference, toggleable uncertainty ribbons (CEM lo/hi, FVS q10/q90), engine hover, URL deep-links.
- Tier B spatial layer (Maine): LANDIS biomass total + 4 species, timestep + opacity, layer-aware legend.
