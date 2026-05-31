# PERSEUS Forest Intelligence

CONUS multi-model forest-carbon explorer covering all 48 conterminous states with deep focal coverage for Maine, Indiana, and Georgia (Minnesota, Oregon, Washington, and Idaho now also carry multi-engine series). Pick a state, drill into multi-model growth curves with uncertainty ribbons and the FIA above-ground reference; toggle the LANDIS biomass spatial layer for Maine (total + balsam fir, red spruce, red maple, pine) plus a growing library of CONUS rasters (LCMS disturbance, TreeMap forest type, relative density, BGI/CSI/CSPI, asymptotic AGB, LANDFIRE canopy height, Hansen forest loss).

Built on the `perseus_db` carbon-pool-harmonized database (current export schema `perseus_api_v1`). Static React + Vite + MapLibre, deployed via GitHub Pages.

**Live app:** https://holoros.github.io/perseus-forest-intelligence/
**Latest deployed version:** v1.3 (gh-pages, May 2026)
**Latest release tag:** v0.56 (release tagging is currently behind the deployed build; see Known limitations).

## Develop / build

```
npm install
npm run dev        # local dev server
npm run build      # static bundle -> dist/
```

## Refresh data

The `public/api/` JSON and the `public/raster/` overlays are exported from the upstream `perseus_db` repo. To refresh after a DB change:

1. From `perseus_db` (upstream): `python3 scripts/48_export_api.py .`
2. Copy: `cp -r perseus_db/api/* path-to-this-repo/public/api/`
3. Re-run `scripts/50_raster_image_overlays.sh` if the spatial inputs changed and copy `public/raster/`.
4. Commit + push to `main`; the GitHub Actions workflow rebuilds and redeploys.

## Deploy

The Pages site currently deploys via direct push to the `gh-pages` branch
(Settings to Pages to Source: "Deploy from a branch", branch `gh-pages`). The
`.github/workflows/deploy-pages.yml` workflow exists but is gated to
`workflow_dispatch:` only and the Pages Source is intentionally NOT "GitHub
Actions" -- both must stay that way until the v1.3 features are reconciled
into main source. See `CONTRIBUTING.md` and `docs/desync.md`.

## What's in here

* CONUS choropleth (engines per state); 48-state coverage with focal ME/IN/GA highlight and multi-engine coverage for ME (32), WA (8), GA (7), MN (7), IN (6), ID (6), OR (5).
* Multi-model growth curves with metric and management controls (reserve, managed harvest, managed intensive, managed conservation), FIA reference, toggleable uncertainty ribbons (CEM lo/hi, FVS q10/q90), engine hover, URL deep-links.
* YC engine: FIA empirical Chapman-Richards yield curves stratified by forest type x EPA Level III ecoregion x ownership, with owner-specific harvest regimes and a climate sensitivity ribbon driven by a state-specific CSI envelope (eastern domain) plus modeled extrapolation for western and plains states.
* Tier B spatial layer (Maine): LANDIS biomass total + 4 species, timestep + opacity, layer-aware legend.
* CONUS raster overlays: LCMS disturbance cause (2022), TreeMap forest type group, relative density, BGI/CSI/CSPI productivity, asymptotic AGB, LANDFIRE canopy height, Hansen forest loss, harvest intensity, expected removal.
* Per-state HTML reports for GA, ID, IN, ME, MN, OR, WA.
* Stumpage view: $/MBF and $/cord by state, 120K observations 1977 to 2026, deflated to real $24 with the BLS CPI-U.
* Methods page: CONUS B1.1 vs B1.3 inventory stratification analysis at n=48.

## Engines

The current export catalogues 34 engines across 48 states and 70+ metrics covering carbon stocks, fluxes, volume, biodiversity, mortality, disturbance, and ownership. See `public/api/meta.json` for the canonical catalog.



## Methods and data provenance

* CONUS yield-curve methodology: `docs/yc_engine_provenance.md` and the in-app methods page at https://holoros.github.io/perseus-forest-intelligence/methods/.
* Inventory stratification analysis (CONUS B1.1 vs B1.3 at n=48): `public/methods/inventory-stratification/`.
* Per-state HTML reports: `public/reports/{GA,ID,IN,ME,MN,OR,WA}_report.html`.
* All scientific outputs cite `perseus_db` schema `perseus_api_v1` (see `public/api/meta.json` for the current snapshot).

## Known limitations

* **Release tagging lag:** the latest release tag is v0.56 while the deployed app on gh-pages reports v1.3 and the source under `main/` reports v0.73. Cut new release tags when promoting deployments.
* **Source-deploy desync:** the `gh-pages` branch carries v1.3 features (AOI upload, point-inspector, ycx animation, CSPI v3, divergence heatmap, AOI forward projection) that are not yet reflected in the `main` source. Until those features land in main, keep Pages Source = "Deploy from a branch: gh-pages" and keep the deploy workflow `on: workflow_dispatch:` only.
* **Western climate band:** CSI rasters cover only the eastern domain (lon -90 to -52); 18 western and plains states use a modeled transfer from the national climate-embedding PCs plus latitude (R^2 about 0.3 to 0.4) and are flagged `domain=modeled`.
* **YC managed scenarios** are owner-class default rotations, not explicit per-stand silvicultural prescriptions.

## Citation

If you use PERSEUS Forest Intelligence in research, please cite the underlying `perseus_db` data product and the CRSF yield-curve pipeline. Contact: Aaron Weiskittel (aaron.weiskittel@maine.edu).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Important: do not enable
`push:` on `.github/workflows/deploy-pages.yml` until the v1.3
features in gh-pages are reconciled into main source. The
`v0.73-source` and `v1.3-deployed` tags anchor both states.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the source (main) and deploy
(gh-pages) timelines.
