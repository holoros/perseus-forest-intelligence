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
// Management and reserve scenarios (Wood products, Permanence / risk), Okabe-Ito.
// Shared keys: reserve = bluish green, conservation = sky blue, harvest = orange,
// intensive = vermilion, disturbance-exposed reserve = orange, mortality-stressed = reddish purple.
export const SCENARIO_COL = {
  reserve: "#009E73", conservation: "#56B4E9", harvest: "#E69F00", intensive: "#D55E00",
  dist: "#E69F00", mort: "#CC79A7",
};
// Maine forest types on the Faustmann tab (keys are the source table's labels).
export const FAUSTMANN_FT_COL = {
  "Northern hardwood":"#009E73", "Spruce-fir":"#0072B2", "Mixedwood":"#56B4E9",
  "Aspen-birch":"#E69F00", "White/Red pine":"#D55E00", "Oak/Pine/Hemlock":"#CC79A7",
};
// Text variants of the Okabe-Ito hues for series-colored labels (direct end labels,
// swatch-keyed titles). Lines, bands and swatches keep the original hue; only text uses
// these. Light: each hue darkened along its own hue and saturation until it passes WCAG AA
// (4.5) on both panel surfaces (#FFFFFF and #F4F4F2). Dark: the original hue, except blue,
// which is lightened to pass on #141517 and #1D1F22. Contrast is listed per entry.
export const LABEL_COL = {
  light: {
    "#0072B2": "#0072B2", // 5.19 on panel, 4.71 on panel-2
    "#E69F00": "#946700", // 5.00, 4.54
    "#009E73": "#007F5D", // 5.01, 4.55
    "#CC79A7": "#B64584", // 5.03, 4.57
    "#56B4E9": "#1676AC", // 4.97, 4.52
    "#D55E00": "#B65000", // 5.08, 4.61
  },
  dark: {
    "#0072B2": "#008CDB", // 5.02 on panel, 4.54 on panel-2
    "#E69F00": "#E69F00", // 8.11, 7.33
    "#009E73": "#009E73", // 5.34, 4.83
    "#CC79A7": "#CC79A7", // 5.97, 5.40
    "#56B4E9": "#56B4E9", // 7.92, 7.16
    "#D55E00": "#D55E00", // 4.72 on panel (4.27 on panel-2; labels sit on the panel)
  },
};
export const labelColor = (hex, theme) => (LABEL_COL[theme === "light" ? "light" : "dark"][String(hex).toUpperCase()] || hex);
