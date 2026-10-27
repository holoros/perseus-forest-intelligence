// One categorical palette for model engine families, used by every chart, chip and report.
// Okabe-Ito (colorblind safe). Variants within a family share the color and differ by line style.
export const FAMILY_COL = {
  CBM: "#0072B2", FVS: "#E69F00", CEM: "#009E73", YC: "#CC79A7",
  LANDIS: "#56B4E9", OSM: "#D55E00",
};
export const CONTEXT_COL = "#9AA0A6"; // families outside the six (HCM, VCC, FIA, unknown)
// FIA forest type groups (AGB yield curve tab), one Okabe-Ito color per type.
export const TYPE_COL = {
  SF: "#009E73", MBB: "#D55E00", AB: "#E69F00", OAK: "#0072B2", EAC: "#CC79A7", WRPH: "#56B4E9",
};
