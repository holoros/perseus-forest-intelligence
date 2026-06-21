# PERSEUS DST demo guide — Monday June 22

One-page script for walking the team through the prototype. Tool is live at
https://holoros.github.io/perseus-forest-intelligence (v1.32).

## The one-liner

PERSEUS is precision forestry, the forest analog of precision ag: it gives a landowner
highly localized, parcel-specific intelligence on value, risk, and sensitivity to future
conditions, by running multiple models across contrasting economic, policy, and climate
scenarios anywhere in CONUS. That is a different product than Vibrant Planet, which is
single-objective (wildfire and carbon) prioritization sold to agencies.

## The differentiators to keep saying

- Multi-criteria: every scenario scored across economics, carbon, ecosystem services,
  resilience, disturbance/climate risk, and cross-model agreement.
- Multi-model: real FVS, CBM, CEM, and yield ensembles, with the spread shown as honest
  uncertainty rather than one black-box number.
- Scenarios driven by future economics (markets for fiber and ES), policy (LSOG,
  compliance carbon, proforestation, public restrictions), and forest conditions
  (climate, disturbance, resilience).
- Freemium and on-demand: free precomputed tier to hook users; subscriber custom runs
  dispatched to the OSC Cardinal HPC cluster.

## 5-minute live flow

1. Compare areas. Pick a state on the map; show how it ranks against similar places.
2. Draw an AOI (the AOI ↑ tool) or upload a boundary. Show the area report: localized
   forest health, the surrounding-area disturbance/climate stress with the sensitivity
   read, and the potential value band (per-acre NPV range across markets and management)
   - the parcel-specific signal a generic appraisal misses.
3. Click "Run scenarios →" to jump that area into Build a run (pre-set to its state).
4. Build a run: pick the data source (FIA precomputed, or TreeMap / upload your own
   inventory for a subscriber Cardinal run), toggle models (FVS, CBM, CEM, yield),
   build two or three scenarios
   (reserve vs managed, historic vs RCP), set market prices, ES payments, and a policy
   (flip to LSOG protection or proforestation and note the framing: forestry policy
   trends toward restricting cutting, unlike ag).
5. Press the purple "Submit custom run to Cardinal" button; watch the HPC queue animate,
   then the results appear.
6. Walk the outputs: per-scenario multi-model ensemble charts (divergence = uncertainty),
   economics (timber + carbon + ES NPV), the multi-criteria scorecard (toggle Emphasis
   from Income to Carbon to Resilience and watch the winning scenario change), and the
   plain-language recommendation.
7. Press "Download report" to hand them a landowner-ready HTML/PDF.

## Proof it really runs (if asked)

The same run-spec executes for real on Cardinal. From a terminal:
  ~/perseus_run/fire_testcase.sh -69.0 45.2     (Maine)
returns a result.json with real FVS/CBM/CEM/yield trajectories. The browser submit is
the GUI front door; this is the compute behind it.

## Caveats to state up front (credibility with this audience)

- Prices, ES payments, and policy effects are illustrative placeholders; the mechanics,
  not the numbers, are the point.
- Climate scaling of the yield curves is labeled pending (CEM calibration in progress).
- Resilience and risk are state HRR baselines with an illustrative management adjustment.
- Free tier resolves precomputed series; live browser-to-Cardinal dispatch needs the
  always-on backend (hosting decision in the launch memo).

## Stress-tested

50/50 states resolve the ensemble with zero errors; 1,176 to 1,568 scorecard
computations across states, policies, and emphases returned zero NaN or out-of-range
scores; states without a representative ecoregion degrade gracefully.

## Asks for the team

- Which real regional price series and policy parameters to plug in.
- The hosting decision for the on-demand backend.
- How the maps and species layers (Erin, Kasey, Ken) feed the run-spec as inputs.
