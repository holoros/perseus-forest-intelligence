# PERSEUS DST — session handoff and future-refinement roadmap

Prepared June 22, 2026. State of the prototype after the build sprint, and a prioritized
plan for what comes next. Companion to the demo guide (20260622_PERSEUS_demo_guide.md),
the launch architecture (20260620_PERSEUS_launch_architecture.md), and the competitive
analysis (20260621_PERSEUS_competitive_analysis.md).

## 1. Where things stand

Live tool: https://holoros.github.io/perseus-forest-intelligence (v1.34), repo
holoros/perseus-forest-intelligence, React/Vite/MapLibre static SPA on GitHub Pages,
auto-deployed by the Pages workflow on push to main.

The product is now a coherent precision-forestry decision tool for a private landowner:
pick or draw an area, see localized health/risk/value, then run multiple models across
contrasting economic, policy, and climate scenarios and get a scored recommendation and a
downloadable report. This is deliberately a different product than Vibrant Planet
(single-objective wildfire/carbon prioritization sold to agencies).

What is live and working:

- Tabs: Compare areas, Scenario runner, Build a run, Forest health; research tools behind
  a toggle.
- AOI flow (draw / upload / click): localized HRR health, surrounding-area disturbance and
  climate stress with a sensitivity read, a per-acre valuation band across markets and
  management, plus a "Run scenarios" jump into Build a run.
- Build a run (the on-demand front door): data source (FIA / TreeMap / upload inventory),
  model selection (FVS, CBM, CEM, yield, LANDIS), scenario builder (management x climate),
  market prices (low/base/high), ecosystem-service payments, and a policy driver
  (certification, riparian set-aside, LSOG/old-growth, compliance carbon, proforestation,
  public restrictions, reserve mandate).
- Outputs: real multi-model ensemble charts (spread = uncertainty), economics (timber +
  carbon + ES NPV), a six-criterion multi-criteria scorecard (economics, carbon, ES,
  resilience, disturbance/climate risk, model agreement) with emphasis weighting, a
  plain-language recommendation, and a one-click downloadable HTML/PDF report.
- Free tier resolves the real precomputed PERSEUS multi-model series client-side; the
  subscriber path animates an HPC-queue submission of the same run-spec.
- Backend proven on Cardinal: run-spec -> AOI resolution (state + ecoregion) -> real
  multi-model + economics -> result.json. One-command demo: ~/perseus_run/fire_testcase.sh
  <lon> <lat>. Run-service scaffold in active-projects/perseus/run-service/.

Stress-tested: 50/50 states resolve the ensemble with zero errors; 1,176 to 1,568
scorecard computations across states, policies, and emphases returned zero NaN or
out-of-range; all 82 ecoregions yield valid value bands; clean build from scratch.

## 2. What is real vs illustrative (read before refining)

Real: the multi-model trajectories (FVS, CBM, CEM, yield) from the precomputed PERSEUS
series; the per-L3 yield curves; the HRR stress/resilience layer; AOI-to-state and
AOI-to-ecoregion resolution; the Cardinal run pipeline for the yield engine.

Illustrative (placeholders to replace): forward price paths (saw/pulp/biomass), the carbon
price, ecosystem-service payment levels, the 4% discount rate, the policy multipliers, the
management adjustments to resilience and risk, and the saw/pulp split. The mechanics are
sound; the numbers are stand-ins for team-supplied values.

Not yet built: live browser-to-Cardinal dispatch (needs an always-on backend); climate
scaling of the yield curves; engine execution for FVS/CBM/CEM/LANDIS inside the on-demand
runner (only yield runs live; the others are served from precomputed series).

## 3. Future refinements (the focus), prioritized

### Tier 1 — credibility and correctness (do first)

1. Replace illustrative economics with real regional series: stumpage by product
   (sawtimber, pulp, biomass) and region, a defensible carbon price path or scenarios, and
   ecosystem-service payment values where markets exist. Source from CFRU/industry and the
   literature. This is the single biggest credibility lift.
2. Climate scaling of yield and engine outputs. Integrate the cem2100GA calibrated climate
   run so RCP4.5/8.5 actually diverge from historic, per L3. (Open task; CEM watch is
   running.)
3. Ground the policy multipliers and the management adjustments to resilience/risk in
   evidence or expert elicitation, or expose them as user-adjustable with cited defaults.
   Right now they are reasonable but illustrative.
4. Faustmann/rotation-based NPV instead of single-harvest-at-horizon. The Faustmann logic
   already exists in the research tabs; wire it into the run economics so timber value
   reflects optimal rotation, not a one-time cut at 2100.

### Tier 2 — the precision-forestry depth

5. Surrounding-hex valuation and neighbor behavior. Finalize the landowner_by_hex Cardinal
   job (open task) and build the neighborhood projection: what surrounding owners are
   likely to do (NCX-style BAU from ownership, market proximity, prices, history), folded
   into the AOI's value and risk. This is the deepest differentiator and is half-built
   (surrounding-area HRR + sensitivity are done; ownership/BAU is pending the data).
6. Higher spatial resolution. Wire the data-agnostic path so TreeMap and user-uploaded
   inventory actually initialize stands (currently the selector is GUI-side; the compute is
   precomputed-FIA). This moves PERSEUS toward Vibrant Planet's stand/pixel resolution.
7. Disturbance specificity. Decompose HRR stress into the agents that matter to owners
   (spruce budworm, fire, drought, pests) so the risk criterion and the AOI report name the
   actual threat, not a composite.
8. Uncertainty as a first-class output. The ensemble spread is shown; add explicit
   confidence bands and a "what would change this recommendation" sensitivity panel.

### Tier 3 — launch infrastructure (needs team decisions)

9. Stand up the run-service backend on an always-on host that can reach Cardinal, so the
   browser submit is a real dispatch rather than an animation. Decision needed: hosting
   (institutional VM / cloud / OSC OnDemand).
10. Wire the heavy engines (FVS, CBM/GCBM, CEM, LANDIS) into the on-demand runner so
    subscriber custom runs execute live for the exact AOI and inventory; reuse existing
    engine code. Add a per-subscriber compute quota and queue policy.
11. Accounts, entitlements, and billing. Configure with a provider; the scaffold has the
    tier flags and entitlement check stubbed (payment/credential handling is the team's to
    set up, not in the scaffold).
12. Precompute store densification for the free tier (a denser factorial so any point, any
    common scenario, answers instantly).

### Tier 4 — product polish

13. Consolidate Scenario runner and Build a run (overlapping); Build a run is the more
    complete flow. Decide whether to merge or differentiate.
14. Map-draw AOI directly into Build a run (currently the jump pre-sets the state; the next
    step is passing the polygon and resolving its L3 mix for blended economics).
15. Saved analyses, shareable links, and owner profiles.
16. Branding and onboarding (org-branding skill); first-run guidance for non-technical
    owners.

## 3b. Guo-framework alignment track

The refinement tiers also map onto the integrative-AI forest-health framework (Guo et al.
2026); see 20260622_PERSEUS_Guo_framework_alignment.md and the one-slide overlay
(PERSEUS_Guo_framework_overlay.svg). PERSEUS already occupies the framework's Assessment
box (scenario modeling for future management) and the values-and-management-goals
foundation. The roadmap maps to the remaining boxes:

- Data/attributes imagery layer (deep learning on NAIP/LiDAR/satellite) = the mapping
  team's work + SPADE -> feeds Tier 2.6 (resolution) and Tier 2.7 (disturbance specificity).
- AI-tools axis widening: classical (have) -> deep learning (mapping team) -> generative
  (Tier 4 reporting/NL interface) -> agentic (Tier 3 run-service broker).
- Surveillance (near-term) horizon = a new track: add a near-real-time disturbance feed to
  complement the long-term Assessment PERSEUS already does.
- Verification/validation: formalize the existing agreement + FIA checks into a continuous
  loop (Tier 1.x).
- Drivers: decompose HRR stress into named agents (Tier 2.7).

Unifying message for the team: maps and modeling are adjacent boxes of one pipeline, not
competing visions.

## 3c. Known display issues

- Engine-compare chart readability (fixed, v1.35): uncertainty bands now aggregate to one
  soft envelope per model class instead of one per engine, and member lines thin and fade
  when many engines draw. The chart is far cleaner; further polish (class-median bold line)
  is optional.
- Raster overlay misalignment (open, needs data pipeline): the SVG vector map uses USA
  Contiguous Albers (ESRI:102003, lat_0 37.5). Raster overlays register only if warped to
  the same projection. Two failure modes remain: (a) legacy per-state PNGs carried as WGS84
  corners are placed by an axis-aligned bbox of projected corners, which cannot register
  under Albers; (b) any raster warped to EPSG:5070 (NAD83 Albers, lat_0 23) sits offset from
  the lat_0 37.5 frame. Fix: re-warp all overlay rasters to ESRI:102003 server-side; until
  then keep raster data layers off for the demo (the vector choropleth is correctly
  projected). The MapLibre base map, used elsewhere, projects correctly.

## 4. Where things live

- Front end: repo holoros/perseus-forest-intelligence. Key components: RunBuilder.jsx (the
  on-demand flow + scorecard + report), ScenarioRunner.jsx, AOIReport.jsx (AOI report +
  surrounding context + valuation band), CompareAreas.jsx, HealthRiskResilience.jsx,
  SVGMap.jsx, App.jsx (wiring, tabs, data fetches).
- Data (public/api): series/{ST}.json (per-state multi-model), yield_curves_by_l3.json,
  hrr_*.json, landowner_yields.json, stumpage.json, faustmann_rotation.json.
- Run-service scaffold: active-projects/perseus/run-service/ — run_spec.schema.json,
  backend/app.py, backend/cardinal_dispatch.py, cardinal/run_scenario.py (the working
  runner), cardinal/fire_testcase.sh, cardinal/submit_scenario.slurm, README.md, and the
  example_result*.json outputs.
- Cardinal: ~/perseus_run/ (runner + data) and ~/perseus_runs/ (per-run dirs). Access via
  the hpc-cardinal skill.
- Documents (active-projects/perseus): launch architecture, competitive analysis, demo
  guide, this handoff, and the earlier meeting packet/deep-dive/refinement requests.

## 5. Open decisions for the team

- Real price/policy/ES parameters to replace the placeholders.
- Hosting for the on-demand backend.
- Billing provider and the exact free-vs-paid feature line.
- How the maps and species layers (Erin, Kasey, Ken) feed the run-spec as inputs, and how
  the map-commercialization and modeling-commercialization paths converge.
- Per-subscriber compute quota and Cardinal queue policy.

## 6. Immediate next actions

1. Run the demo (see demo guide) and capture team reactions against the Tier 1–4 list.
2. Send the Erin reply (drafted in Gmail).
3. After the meeting, start Tier 1.1 (real economics) and Tier 2.5 (landowner_by_hex
   finalize) in parallel; both unblock the most differentiated value.
