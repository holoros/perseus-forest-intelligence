import { describe, it, expect } from "vitest";
import { FAMILY_COL, TYPE_COL, SCENARIO_COL, FAUSTMANN_FT_COL, LABEL_COL, labelColor } from "../../src/palette.js";

// Series-colored text must pass WCAG AA (4.5) on the chart panel in each theme.
// Panel tokens from src/styles.css: --panel is #FFFFFF (light) and #141517 (dark).
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = c; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const la = lum(hex(a)), lb = lum(hex(b)); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const PANEL = { light: "#FFFFFF", dark: "#141517" };
const OKABE_ITO = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00"];

describe("palette label variants", () => {
  it("covers every Okabe-Ito hue used by the series palettes", () => {
    const used = new Set([...Object.values(FAMILY_COL), ...Object.values(TYPE_COL), ...Object.values(SCENARIO_COL), ...Object.values(FAUSTMANN_FT_COL)]);
    for(const h of used) expect(OKABE_ITO).toContain(h);
    for(const h of OKABE_ITO){ expect(LABEL_COL.light[h]).toBeDefined(); expect(LABEL_COL.dark[h]).toBeDefined(); }
  });
  it("passes AA on the panel in both themes", () => {
    for(const theme of ["light", "dark"]) for(const h of OKABE_ITO)
      expect(contrast(labelColor(h, theme), PANEL[theme]), `${h} ${theme}`).toBeGreaterThanOrEqual(4.5);
  });
  it("falls back to the input for unknown colors", () => {
    expect(labelColor("#123456", "light")).toBe("#123456");
    expect(labelColor("var(--context)", "dark")).toBe("var(--context)");
  });
});
