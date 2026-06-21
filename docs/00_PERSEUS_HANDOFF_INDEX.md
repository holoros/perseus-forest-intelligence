# PERSEUS DST — handoff index

Prepared June 22, 2026. Single entry point to the prototype, the documents, and the next
steps. Read this first.

## The tool

- Live: https://holoros.github.io/perseus-forest-intelligence (v1.37)
- Repo: github.com/holoros/perseus-forest-intelligence (React/Vite/MapLibre static SPA,
  auto-deployed by the Pages workflow on push to main)
- On-demand multi-model run proven on Cardinal: `~/perseus_run/fire_testcase.sh <lon> <lat>`

## What it does (one line)

Precision-forestry decision support: pick or draw an area, see localized health, risk, and
value, then run multiple models across contrasting economic, policy, and climate scenarios
and get a multi-criteria recommendation and a downloadable report. The assessment-and-values
engine of the Guo et al. (2026) forest-health framework, with a near-term surveillance layer.

## Documents (in this folder)

- 00_PERSEUS_HANDOFF_INDEX.md — this file.
- 20260622_PERSEUS_handoff.md — full handoff: state, real vs illustrative, tiered roadmap,
  Guo-alignment track, known display issues, where things live, open decisions.
- 20260622_PERSEUS_demo_guide.md — the 10-minute demo script for Monday.
- 20260622_PERSEUS_red_team.md — adversarial critique, severity-ranked, with answers.
- 20260622_PERSEUS_Guo_framework_alignment.md — how the tool maps to the Guo framework.
- PERSEUS_Guo_framework_overlay.svg / .png / .pdf — the one-slide overlay.
- 20260620_PERSEUS_launch_architecture.md — freemium/on-demand architecture + pricing.
- 20260621_PERSEUS_competitive_analysis.md — vs Vibrant Planet and the field.
- example_AOI_northern_maine.geojson — tested demo parcel (North Maine Woods).
- run-service/ — the on-demand backend scaffold + the working Cardinal runner and example
  results.

## Demo recipe (Monday)

Open the URL. Upload example_AOI_northern_maine.geojson (or draw a north-central Maine area).
Walk the AOI report (localized health, surrounding-area disturbance/sensitivity, value band).
Run scenarios -> Build a run (data source, models, scenarios, market/ES/policy) -> the
near-term surveillance panel -> Submit to Cardinal (animated) -> ensemble + economics +
multi-criteria scorecard + recommendation -> Download report. Use Maine; keep raster layers
off. Lead with the caveats (see red-team).

## Consolidated next steps (post-meeting), in priority order

1. Tier 1 credibility: real regional prices (CFRU/TMS), Faustmann rotation NPV (data in
   hand), ground the policy/resilience/risk multipliers, unify the two economic bases.
2. Climate scaling: integrate the cem2100GA calibrated run so historic vs RCP diverge.
3. Surrounding-hex neighbor BAU: finalize the landowner_by_hex Cardinal job, then build the
   neighborhood projection.
4. Resolution: wire TreeMap and uploaded inventory to actually initialize stands (toward the
   precision-forestry resolution claim).
5. Guo build-out: bring the mapping team's imagery in as the deep-learning data-attributes
   layer; expand the surveillance feed CONUS-wide; formalize the validation loop.
6. Launch infrastructure (needs team decisions): hosted backend, live heavy-engine runs,
   accounts/billing, precompute densification.
7. Display: re-warp overlay rasters to ESRI:102003 to fix map alignment.

## Open decisions for the team

Real price/policy/ES parameters; hosting for the backend; billing provider and the
free-vs-paid line; how the maps/species layers feed the run-spec; per-subscriber compute
quota.

## Citable release

A Zenodo deposit package is staged in run-service/.. (see zenodo_upload/). Publishing mints a
public DOI; that step is intentionally left for Aaron to run with the API token.
