# Aligning PERSEUS with the Guo et al. (2026) forest-health AI framework

Prepared June 22, 2026. How the PERSEUS DST maps onto the integrative-AI forest-health
framework (Guo, Q. et al. 2026) shown at the meeting, and a path to get there. Companion
to the handoff (20260622_PERSEUS_handoff.md).

## The framework, briefly

Forest health drivers (biotic, abiotic, human) feed a training-data engine that pairs
Data/attributes (tree growth/mortality, structure, composition, tree cover, biodiversity,
degree of invasion; and the derived attributes integrity, productivity, resistance,
resilience, sustainability) with an AI-tools spectrum (classical ML -> deep learning ->
generative AI -> agentic AI), inside a verification/validation loop. That engine powers
forest-health monitoring in two horizons: Surveillance (near-term: real-time threat
detection, disturbance mapping) and Assessment (longer-term: trend analysis, scenario
modeling for future management). The whole thing rests on a foundation of values and
management goals.

## Where PERSEUS already is

- Assessment / scenario modeling for future management: this is PERSEUS's core. Build-a-run
  is precisely "scenario modeling for future management." PERSEUS is the assessment anchor
  of this framework.
- Values and management goals (the foundation): operationalized by the multi-criteria
  emphasis weighting (Income / Carbon / Resilience and risk). Most tools bolt values on at
  the end; PERSEUS makes them the scoring foundation. This is a genuine differentiator.
- Data/attributes: PERSEUS already uses most of this column: growth and mortality (yield
  curves, FVS), structure, composition, tree cover, biodiversity (ES), and the derived
  attributes (productivity, resistance, resilience, sustainability) via the HRR layer.
- Forest health drivers: HRR stress captures biotic and abiotic disturbance; the landowner
  and harvest layers capture human activity.
- Verification/validation: partially present as multi-model agreement and FIA reconciliation
  of observed vs ensemble.

## The gaps, and how to close them

1. Broaden the AI-tools axis. PERSEUS today sits at the classical/mechanistic end (growth
   and yield, mixed-effects, model ensembles). The path toward integrative AI:
   - Deep learning for the data-attributes layer: CNNs on NAIP, LiDAR, and satellite to
     derive structure, composition, tree cover, and disturbance. This is exactly where the
     mapping work (Kasey, Ken) and SPADE plug in, as the imagery-to-attributes engine that
     feeds assessment.
   - Generative AI: richer landowner report narratives (the report generator is a simple
     start), a natural-language interface ("ask your forest"), and synthetic data for rare
     pests.
   - Agentic AI: adaptive sampling, self-correcting runs, and orchestration of the model
     ensemble. The run-service broker and the autonomous OODA pipeline are early agentic AI.
2. Add near-term Surveillance. PERSEUS is long-term assessment only. Connect near-real-time
   disturbance data (remote-sensing alerts, a continuously updated HRR observed-disturbance
   layer) so one tool spans the full arc, surveillance plus assessment.
3. Formalize the verification/validation loop. Turn the existing agreement and FIA checks
   into a continuous loop: new FIA and remote-sensing data re-validate and re-train the
   engines on a cadence.
4. Decompose the drivers. Split HRR stress into the agents that matter (spruce budworm,
   fire, drought, pests, harvest) so the tool maps explicitly to the driver column and names
   the actual threat.

## The unifying message for the team

The maps and the modeling are not competing visions; they are two boxes of the same
framework. The mapping and SPADE work is the deep-learning data-attributes layer;
PERSEUS is the assessment and scenario engine; both live under integrative AI on a shared
foundation of values and management goals. Framing the program this way converges the
mapping-commercialization and modeling-commercialization paths rather than choosing between
them.

## Sequencing (ties to the handoff roadmap)

- Near-term (already on the roadmap): real economics, climate scaling, driver decomposition
  (Tier 1 and the disturbance-specificity item). These deepen the assessment box.
- Mid-term: bring the imagery/deep-learning data-attributes layer (mapping team) into the
  run-spec as inputs; add generative reporting and an NL interface; formalize validation.
- Longer-term: stand up the agentic on-demand run-service at scale; add the Surveillance
  horizon with near-real-time disturbance feeds.

Net: PERSEUS does not need to be rebuilt to fit this framework. It already occupies the
assessment anchor and the values foundation. Getting fully there means widening the AI-tools
axis (with the mapping team's imagery work as the deep-learning layer), adding a surveillance
horizon, and closing the validation loop.
