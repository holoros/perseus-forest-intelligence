# PERSEUS Forest Intelligence

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20516949.svg)](https://doi.org/10.5281/zenodo.20516949)

Precision-forestry decision support for the conterminous US. Pick or draw an area, see its
localized forest health, risk, and value, then run multiple growth-and-yield models across
contrasting economic, policy, and climate scenarios and get a multi-criteria recommendation
and a downloadable report. Built as the assessment-and-values engine of the Guo et al. (2026)
integrative forest-health framework, with a near-term disturbance-surveillance layer.

**Live app:** https://holoros.github.io/perseus-forest-intelligence/
**Deployed version:** v1.39 (this branch; main deploys v1.38 until it merges)
**Stack:** React + Vite, inline SVG map, static SPA, auto-deployed to GitHub Pages from `main`.

## Two views, one tool

A header toggle sets the interface for the audience:

- **Landowner (default):** a simplified path. Pick your state or find your area
  (`Forest near me`, AOI upload, coordinate jump), then use three tabs: Compare areas,
  Build a run, and Forest health. Research-only map controls are hidden.
- **Researcher:** the full surface. All map data layers (forest structure, ownership,
  stumpage/products, future risk), the carbon-trajectory map mode, point inspection, and the
  full tab set (Engine compare, RD trend with relative density thresholds, Engine spread,
  Cross-model ensemble, Stumpage, LANDIS, Spatial biomass, Landowner yields, Faustmann
  rotation, Ecoregion harvest, Permanence / risk, Wood products, FIA AGB yield curves).
  A header toggle switches light and dark themes.

## What it does

- **Compare areas:** how a state or drawn area stacks up against similar places on priority
  forest area, stress, resilience, and climate exposure.
- **Build a run:** the on-demand flow. Choose an area and data source (FIA / TreeMap / upload
  inventory), select models (FVS, CBM, CEM, yield curves, LANDIS), build management x climate
  scenarios, set market prices, ecosystem-service payments, and a policy driver, then get a
  real multi-model ensemble, per-acre economics (timber + carbon + ecosystem services), a
  six-criterion multi-criteria scorecard, a plain-language recommendation, and a one-click
  HTML/PDF report. The free tier resolves the precomputed PERSEUS series client-side; the
  subscriber path dispatches the same run-spec to the OSC Cardinal HPC cluster.
- **Forest health:** priority forest area (stress x resilience) for 48 states and ~219k FIA
  plots, with current vs RCP4.5/RCP8.5 projections, ownership and ecoregion breakdowns, and a
  per-state species/vulnerability drill-down. Map units: surface, hexes, counties, ecoregion.

## Develop / build

```
npm install
npm run dev        # local dev server
npm run build      # static bundle -> dist/
npm run preview    # serve the built bundle
```

Checks (all run in CI on every push and pull request):

```
npm test                                              # Vitest unit suites (tests/unit)
python3 -m pytest -q tests/py                         # data check scripts
python3 scripts/check_restricted_fields.py public docs   # restricted data tripwire
python3 scripts/check_api_integrity.py public/api --strict
node scripts/check_versions.mjs                       # one version everywhere
node scripts/smoke.mjs [baseURL]                      # optional smoke test of a build or the live site
```

## Deploy

Continuous deploy: `.github/workflows/deploy-pages.yml` builds with Vite and publishes
`dist/` via the Pages artifact on every push to `main`. Pages Source must be set to
"GitHub Actions". A clean build reproduces the deployed site, so pushes to `main` are
non-regressive. To deploy: commit to `main` and push.

A backend launch-architecture scaffold (Supabase + Cloudflare Pages + Paddle, with Cardinal
as the compute layer) lives in `run-service/`. It is configuration and code templates only;
standing it up requires creating the accounts and supplying credentials (see
`run-service/README.md`). The static app runs fully without it.

## Data

`public/api/` is the canonical data source of truth. Key files:

- `series/{ST}.json`: per-state multi-model trajectories by management and metric.
- `meta.json`, `states.json`: catalog and per-state coverage.
- `yield_curves_by_l3.json`: FIA Chapman-Richards yield curves by forest type x EPA L3
  ecoregion x ownership.
- `hrr_*.json`: forest health/risk/resilience by state, grid, county, ecoregion, hex, owner.
- `landowner_by_county.json` (and `_ecoregion`, `_hex` as they are produced): ownership
  composition from the USDA FS forest-ownership raster (RDS-2025-0045).
- `stumpage.json`, `faustmann_rotation.json`, `landowner_yields.json`, `landis_stratified.json`.
  `faustmann_rotation.json` is regenerated at the Maine blended stumpage with no regeneration
  cost (v1.39); its `meta.params` block records the price, discount rate and rotation grid.
- `ecoregion_harvest_summary.json`, `permanence_risk.json`: the Ecoregion harvest and
  Permanence / risk tabs (`scripts/build_ecoregion_harvest_summary.py`,
  `scripts/build_permanence_risk.mjs`).
- `agb_yield_curves_fia.json`: FIA remeasurement AGB yield curves for ME, NH, VT, MI, WI and
  MN by forest type group and ecological section (`scripts/build_agb_yield_curves.py`).
- `rd_thresholds_l3.json`: relative density breakpoints by forest type and EPA L3 ecoregion
  with a state to ecoregion lookup (`scripts/build_rd_thresholds.py`).
- `data_sources.json`: the citation registry rendered on the Data & cite page; every
  deposited product carries its Zenodo DOI.
- `geo/us_counties.geojson`: CONUS county boundaries for the county map unit.
- `fia_plots/{ST}.json`: FIA plot attributes for the AOI report. Coordinates are the public,
  perturbed FIADB values rounded to 0.01 degree, never true plot locations; see
  `docs/methods_fia_plot_coordinates.md`.

Raster overlays are in `public/raster/`, produced by `scripts/50_raster_image_overlays.sh`
and listed in `public/raster/manifest.json` (`scripts/build_raster_manifest.py --check`). Every
PNG URL goes through `rasterUrl()` so the overlays can move to object storage by setting
`VITE_RASTER_BASE` at build time; see `docs/raster_storage.md`.

## Methods and provenance

- Yield-curve methodology: `docs/yc_engine_provenance.md` and the in-app methods page.
- Inventory stratification analysis: `public/methods/inventory-stratification/`.
- FIA plot coordinates (public, perturbed, rounded): `docs/methods_fia_plot_coordinates.md`.
- Per-state HTML reports: `public/reports/{GA,ID,IN,ME,MN,OR,WA}_report.html`.
- Architecture decision records: `docs/decisions/`.
- Status and roadmap: `docs/STATUS_2026-10-27.md` (what is integrated, what is pending, open
  decisions).

## Known limitations

- **Economics:** timber value now uses real per-state blended stumpage ($/m3, from
  `api/econ_params.json`) with a user-selectable discount rate. The carbon price,
  ecosystem-service payments, and policy multipliers remain illustrative placeholders. Timber
  value in Build a run is the optimal single-rotation NPV at rotation age R*, with the
  perpetual land expectation value (LEV) also reported, gross of establishment and management
  costs; choosing R* by maximizing LEV rather than single-rotation NPV is an open item. The
  Faustmann rotation tab uses one blended price on all merchantable volume, so it carries no
  sawlog premium and R_opt sits at the 20 yr lower edge of the grid in 17 of 42 unconstrained
  Maine cells; a product split price is the planned fix.
- **Yield curves:** the FIA AGB yield curves are population curves. They have no plot level
  skill for net change, and curve implied net growth runs about 40 percent below EVALIDator
  for NH and VT and 60 to 64 percent of EVALIDator net for the Lake States, so annual flux from
  these curves runs low. The Lake States and NH/VT builds are not yet deposited.
- **Harvest and stumpage products:** the CONUS-HCS harvest decision surface (v5) and the
  harmonized stumpage price database remain the deposited sources behind the harvest layers
  and econ_params. Both companion manuscripts were withdrawn from submission on 1 October 2026
  for refits (a species group by region price model with a series term; a GRM cut based
  harvest positive class), so revised versions of both products are expected.
- **Climate scaling:** RCP pathways currently share the baseline yield curves for most
  engines; calibrated CEM climate scaling is in progress, so historic and RCP may read
  similarly until it lands.
- **Western climate band:** CSI rasters cover the eastern domain; 18 western/plains states use
  a modeled transfer (flagged `domain=modeled`).
- **perseus_db export:** `public/api/` is canonical; re-syncing the upstream DB export to
  reproduce the deployed data is tracked separately.

## Citation

Cite the software with `CITATION.cff` and the data products behind the view you used from
the in-app Data & cite page (`public/api/data_sources.json` is the registry). Deposited
products: CBM-CONUS trajectories 10.5281/zenodo.20516949, FVS engine evidence
10.5281/zenodo.21027931, inventory stratification 10.5281/zenodo.20519700, CONUS-HCS harvest
decision surface 10.5281/zenodo.20533718, stumpage price database 10.5281/zenodo.20836865,
Maine FIA AGB yield curves 10.5281/zenodo.23406410, RD thresholds 10.5281/zenodo.23397937.
Contact: Aaron Weiskittel (aaron.weiskittel@maine.edu).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The Pages workflow deploys `main` automatically;
verify a clean `npm run build` before pushing.
