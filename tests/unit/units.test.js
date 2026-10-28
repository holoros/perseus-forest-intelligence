import { describe, it, expect } from "vitest";
import { conv, unitLabel, fmtArea, fmtUnit } from "../../src/units.js";

const T = "\u2009"; // thin space between unit factors

// Independent conversion factors from SI definitions.
const AC_HA = 0.40468564224, FT = 0.3048, SHORT_TON_MG = 0.90718474;

describe("conv", () => {
  it("passes values through in the Imperial system and for unknown units", () => {
    expect(conv(10, "ton/ac", "imperial")).toEqual({ value: 10, unit: `ton${T}ac⁻¹` });
    expect(conv(10, "yr", "metric")).toEqual({ value: 10, unit: "yr" });
    expect(conv(null, "ton/ac", "metric")).toEqual({ value: null, unit: `ton${T}ac⁻¹` });
  });
  it("converts ton/ac to Mg/ha", () => {
    const r = conv(1, "ton/ac", "metric");
    expect(r.unit).toBe(`Mg${T}ha⁻¹`);
    expect(r.value).toBeCloseTo(SHORT_TON_MG / AC_HA, 5);
  });
  it("converts sq ft/ac to m2/ha and cu ft/ac to m3/ha", () => {
    expect(conv(1, "sq ft/ac", "metric").value).toBeCloseTo(FT ** 2 / AC_HA, 6);
    expect(conv(1, "cu ft/ac", "metric").value).toBeCloseTo(FT ** 3 / AC_HA, 6);
  });
  it("converts per acre quantities and $/ac to per hectare", () => {
    expect(conv(100, "per ac", "metric").value).toBeCloseTo(100 / AC_HA, 4);
    expect(conv(100, "$/ac", "metric").value).toBeCloseTo(100 / AC_HA, 4);
  });
  it("converts $/MBF using 1 MBF = 2.36 m3", () => {
    expect(conv(236, "$/MBF", "metric").value).toBeCloseTo(100.01, 1);
  });
});

describe("labels and area formatting", () => {
  it("unitLabel follows the active system", () => {
    expect(unitLabel("ton C/ac", "metric")).toBe(`Mg C${T}ha⁻¹`);
    expect(unitLabel("ton C/ac", "imperial")).toBe(`ton C${T}ac⁻¹`);
    expect(unitLabel("index", "metric")).toBe("index");
  });
  it("fmtArea reports the primary unit first", () => {
    expect(fmtArea(4046.8564224 * 10, "imperial")).toMatch(/^10 ac \(4 ha\)$/);
    expect(fmtArea(1e4 * 10, "metric")).toMatch(/^10 ha \(25 ac\)$/);
    expect(fmtArea(0, "metric")).toBe("n/a");
  });
});

describe("fmtUnit (house unit style)", () => {
  it.each([
    ["Mg/ha/yr", `Mg${T}ha⁻¹${T}yr⁻¹`], ["sq ft/ac", `ft²${T}ac⁻¹`], ["cu ft/ac", `ft³${T}ac⁻¹`],
    ["$/MBF", `$${T}MBF⁻¹`], ["per ac", "ac⁻¹"], ["g/cm3", `g${T}cm⁻³`], ["m2/ha", `m²${T}ha⁻¹`],
    ["trees/ha", `trees${T}ha⁻¹`], ["Tg C", "Tg C"], ["%", "%"], ["yr", "yr"],
  ])("%s -> %s", (u, want) => expect(fmtUnit(u)).toBe(want));
  it("never leaves a slash and passes non strings through", () => {
    for (const u of ["ton/ac", "$/ac", "m³/ha/yr", "t/ac"]) expect(fmtUnit(u)).not.toContain("/");
    expect(fmtUnit(null)).toBeNull();
    expect(fmtUnit(undefined)).toBeUndefined();
  });
});
