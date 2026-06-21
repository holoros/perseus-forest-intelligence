# PERSEUS competitive analysis: Vibrant Planet and the landscape

Prepared June 21, 2026, for the PERSEUS DST subteam. Where PERSEUS sits against the
incumbents, what bar it must clear to be competitive, and how to position it.

## 1. The short version

Vibrant Planet is the closest analog and the one to study, but it is not the same
product. They are a wildfire and public-land restoration prioritization platform sold
to agencies; PERSEUS is aimed at a private landowner making a strategic
management-and-markets decision under climate change. They share core infrastructure
(cloud, high-res spatial data, real-time scenario comparison), which is exactly the
infrastructure we are now building. Our wedge is the combination they do not have:
a multi-model ensemble, forward markets for fiber and ecosystem services, explicit
climate scenarios, and landscape context (what neighbors are likely to do), at national
scale and with peer-reviewed science behind it.

## 2. Vibrant Planet (Land Tender)

What it is: a cloud SaaS that moves land-management planning off paper into real-time,
high-resolution scenario planning. The user sets priorities and a budget, draws an area,
and the system generates and compares treatment scenarios.

Engine and data: built on FORSYS, the US Forest Service's official treatment-optimization
algorithm, over a large GIS stack on top of LIDAR. It predicts roughly ten outcome
categories: air quality, carbon sequestration, water reliability, social well-being,
fire-adapted community, fire dynamics, forest resilience, biodiversity, wetland integrity,
and economic diversity. Users create and compare unlimited scenarios optimized by
objectives and constraints, monitor and adapt, and collaborate on shared scenarios.

Scale and traction: deployed on roughly 5 to 7 million acres (Lake Tahoe Basin and
surrounding watersheds), with a stated goal of 15 million. Customers are mostly federal
and state agencies (Forest Service, BLM), governments, NGOs, and more recently PG&E as a
large at-risk landowner. Pricing is acre-based (an earlier offering was about $3,500 per
seat). Funding is on the order of $40M across about five rounds, with investors including
Microsoft.

Strengths to respect: an agency-trusted optimization engine (FORSYS), LIDAR-grade spatial
resolution, a polished collaborative workflow, real customers and capital, and a clear
wildfire narrative.

Likely gaps (to confirm): the modeling is essentially one prioritization engine, not an
ensemble with explicit cross-model uncertainty; the economics ("economic diversity") look
shallow versus real timber and fiber market projection; climate is treated as current or
near-term condition rather than contrasting long-horizon scenarios; and the go-to-market
is enterprise and agency, not the individual private landowner. They are carbon and
wildfire first.

## 3. The rest of the field

NCX (formerly SilviaTerra): built Basemap, a high-resolution national forest inventory
(with Microsoft AI for Earth) covering all 48 states, and runs the largest US forest
carbon project by acreage (22,000+ landowners, 34M+ acres). Critically for us, their BAU
("business as usual") harvest model already predicts what a landowner is likely to do from
standing inventory, proximity to markets and transport, prevailing prices, and harvest
history. That is precisely the "what will neighbors do" capability, but they apply it to
sell carbon-deferral payments, not to give the owner a planning tool. Carbon-only.

Pachama, 3Degrees, South Pole: carbon-credit marketplaces and MRV. Adjacent, not
decision-support for management.

FORSYS (USFS): the open treatment-optimization algorithm Vibrant Planet wraps. Available
to us too; relevant if we add treatment optimization.

The pattern: the well-funded players are carbon-and-wildfire and sell to agencies or
carbon buyers. None of them is a markets-aware, multi-model, climate-explicit strategic
planning tool for the private landowner. That gap is the opening.

## 4. The bar PERSEUS must clear to be competitive

To be credible against this field, the user's four drivers are the right requirements.
Mapped to our current state:

- Future markets (fiber + ecosystem services). The differentiator. We already have
  stumpage and Faustmann rotation logic; we need forward price scenarios for sawtimber,
  pulp/fiber, and biomass, plus carbon and ES payment paths, as scenario inputs. No
  incumbent does fiber-plus-ES futures well. Status: partial, highest-value to extend.
- Risk and resilience. Our HRR layer (stress from disturbance and climate vulnerability
  by resilience axes) is built and national. This is a genuine strength versus VP's
  wildfire-centric framing because it generalizes to pests, drought, and markets. Status:
  built.
- Policy constraints. New work. Encode harvest regulations, set-asides, certification
  (FSC/SFI), conservation easements, and reserve rules as scenario constraints the runner
  honors. Status: not started; needed for credibility.
- What other landowners are likely to do (landscape context beyond the AOI). The key
  strategic insight: a single owner's best move depends on the surrounding matrix. We
  already have national landowner-type data by county, hex, and ecoregion; combine it with
  an NCX-style BAU harvest model to project the neighborhood, and explicitly model beyond
  the drawn AOI. Status: data in hand, model to build.

Two more bars are about delivery, not science:

- Spatial resolution. VP has LIDAR-grade, stand-level resolution. PERSEUS is currently
  plot- and ecoregion-resolution. To be competitive on "spatially explicit and
  high-resolution," we need a path to stand or pixel-level initialization (TreeMap and
  user inventory are exactly why the run-spec is data-agnostic), even if the free tier
  stays coarse.
- Scale. Our national grid already answers "any point in CONUS," and the run-spec scales
  from a few acres to millions. This is an advantage over VP's project-by-project onboarded
  acreage; we should lean on it.

## 5. Positioning recommendation

Do not fight Vibrant Planet on their moat. Their wildfire-on-public-land prioritization is
defended by FORSYS, LIDAR, agency contracts, and $40M. Position PERSEUS as the adjacent
product they are not building:

The private-landowner strategic foresight tool: multi-model (FVS, CBM/GCBM, CEM, LANDIS,
yield) with honest cross-model uncertainty, markets-aware (fiber + ecosystem services, not
carbon alone), climate-explicit (contrasting long-horizon scenarios), landscape-contextual
(what the neighborhood is likely to do), at national scale, and backed by peer-reviewed
science rather than a black box. Freemium reach to the individual owner is a different
go-to-market than VP's enterprise sales, which avoids a head-on fight.

What this means for the build, in priority order: (1) forward market scenarios for fiber
and ES on top of the existing economics; (2) the landscape BAU model using our landowner
data; (3) policy constraints in the run-spec; (4) a resolution path via TreeMap and
user-supplied inventory; (5) treatment optimization (FORSYS-equivalent) only if we move
toward the management-planning use case. The multi-model ensemble and HRR are already our
credibility differentiators and should lead the pitch.

## 6. One honest caution

This analysis is built from public materials and should be confirmed. We should request a
Vibrant Planet demo or trial to verify their economics depth, climate handling, and whether
they expose model uncertainty, before committing to a positioning we present externally.

## Sources

- Vibrant Planet platform and Land Tender: https://www.vibrantplanet.net/platform , https://www.vibrantplanet.net/landtender
- Land Tender launch (capabilities, FORSYS, LIDAR, outcome categories, acreage): https://www.vibrantplanet.net/press-room/land-tender-app-launched-to-help-prevent-wildfires-in-tahoe-beyond
- Pricing, customers (PG&E, agencies), acre-based model: https://techcrunch.com/2023/10/05/vibrant-planet-series-a/ , https://techcrunch.com/2022/06/23/vibrant-planet-raises-17m-seed-round-to-grow-forest-restoration-saas/
- Funding and investors: https://www.crunchbase.com/organization/vibrant-planet
- NCX / SilviaTerra Basemap, BAU harvest model, scale: https://ncx.com/learning-hub/new-name-same-dedicated-team/ , https://www.silviaterra.com/ncapx/landowners/
- Pachama and carbon-credit field: https://carboncredits.com/vibrant-planet-forest-restoration/
