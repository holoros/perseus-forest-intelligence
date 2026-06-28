# PERSEUS Forest Intelligence

Precision-forestry decision support for the conterminous US. Pick or draw an area, see its
localized forest health, risk, and value, then run multiple growth-and-yield models across
contrasting economic, policy, and climate scenarios and get a multi-criteria recommendation
and a downloadable report. Built as the assessment-and-values engine of the Guo et al. (2026)
integrative forest-health framework, with a near-term disturbance-surveillance layer.

**Live app:** https://holoros.github.io/perseus-forest-intelligence/
**Deployed version:** v1.38
**Stack:** React + Vite + MapLibre, static SPA, auto-deployed to GitHub Pages from `main`.

## Two views, one tool

A header toggle sets the interface for the audience:

- **Landowner (default):** a simplified path. Pick your state or find your area
  (`Forest near me`, AOI upload, coordinate jump), then use three tabs: Compare areas,
  Build a run, and Forest health. Research-only map controls are hidden.
- **Researcher:** the full surface. All map data layers (forest structure, ownership,
  stumpage/products, future risk), the carbon-trajectory map mode, point inspection, and the
  full tab set (Engine compare, RD trend, Engine spread, Stumpage, LANDIS, Landowner yields,
  Faustmann rotation).

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

- `series/{ST}.json` — per-state multi-model trajectories by management and metric.
- `meta.json`, `states.json` — catalog and per-state coverage.
- `yield_curves_by_l3.json` — FIA Chapman-Richards yield curves by forest type x EPA L3
  ecoregion x ownership.
- `hrr_*.json` — forest health/risk/resilience by state, grid, county, ecoregion, hex, owner.
- `landowner_by_county.json` (and `_ecoregion`, `_hex` as they are produced) — ownership
  composition from the USDA FS forest-ownership raster (RDS-2025-0045).
- `stumpage.json`, `faustmann_rotation.json`, `landowner_yields.json`, `landis_stratified.json`.
- `geo/us_counties.geojson` — CONUS county boundaries for the county map unit.

Raster overlays are in `public/raster/`, produced by `scripts/50_raster_image_overlays.sh`.

## Methods and provenance

- Yield-curve methodology: `docs/yc_engine_provenance.md` and the in-app methods page.
- Inventory stratification analysis: `public/methods/inventory-stratification/`.
- Per-state HTML reports: `public/reports/{GA,ID,IN,ME,MN,OR,WA}_report.html`.

## Known limitations

- **Illustrative economics:** forward prices, the carbon price, ecosystem-service payment
  levels, the discount rate, and the policy multipliers are reasonable placeholders pending
  real regional series (CFRU/TMS stumpage and the ecoregion NPV-by-discount-rate table exist
  on Cardinal and are the next integration). The mechanics are sound; the numbers are stand-ins.
- **Climate scaling:** RCP pathways currently share the baseline yield curves for most
  engines; calibrated CEM climate scaling is in progress, so historic and RCP may read
  similarly until it lands.
- **Western climate band:** CSI rasters cover the eastern domain; 18 western/plains states use
  a modeled transfer (flagged `domain=modeled`).
- **perseus_db export:** `public/api/` is canonical; re-syncing the upstream DB export to
  reproduce the deployed data is tracked separately.

## Citation

If you use PERSEUS Forest Intelligence in research, cite the underlying `perseus_db` data
product and the CRSF yield-curve pipeline. Contact: Aaron Weiskittel
(aaron.weiskittel@maine.edu).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The Pages workflow deploys `main` automatically;
verify a clean `npm run build` before pushing.
