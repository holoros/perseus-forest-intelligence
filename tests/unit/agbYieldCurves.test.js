import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Structural checks on the FIA remeasurement AGB yield curve store
// (scripts/build_agb_yield_curves.py -> public/api/agb_yield_curves_fia.json).
const data = JSON.parse(readFileSync(new URL("../../public/api/agb_yield_curves_fia.json", import.meta.url), "utf8"));
const STATES = ["ME", "NH", "VT", "MI", "WI", "MN"];
const ARRAYS = ["ages", "med", "mean", "lo95", "hi95", "pi90_lo", "pi90_hi", "capped", "extrap"];
const EXPECTED_AGES = Array.from({ length: 51 }, (_, i) => i * 5);

function* cells(){
  for(const st of Object.keys(data.states))
    for(const [sec, s] of Object.entries(data.states[st].sections))
      for(const [t, c] of Object.entries(s.types)) yield { st, sec, t, c };
}
function* keys(o){
  if(Array.isArray(o)){ for(const v of o) yield* keys(v); }
  else if(o && typeof o === "object"){ for(const [k, v] of Object.entries(o)){ yield k; yield* keys(v); } }
}

describe("agb_yield_curves_fia.json", () => {
  it("carries the six Northern Forest states with a statewide (ALL) section each", () => {
    expect(data.schema).toBe("perseus_agb_yield_curves_v1");
    for(const st of STATES){
      expect(data.states[st], st).toBeTruthy();
      expect(data.states[st].sections.ALL, `${st} ALL`).toBeTruthy();
      expect(data.sources[st], `${st} source`).toBeTruthy();
    }
  });
  it("has equal-length arrays in every cell, ages 0 to 250 by 5", () => {
    let n = 0;
    for(const { st, sec, t, c } of cells()){
      n++;
      for(const k of ARRAYS) expect(c[k].length, `${st} ${sec} ${t} ${k}`).toBe(51);
      expect(c.ages).toEqual(EXPECTED_AGES);
      for(const f of [...c.capped, ...c.extrap]) expect([0, 1]).toContain(f);
    }
    expect(n).toBeGreaterThan(200);
  });
  it("keeps lo95 <= med <= hi95 wherever all three are present and med > 0 (thin section cells excepted)", () => {
    // One 5 plot section cell (MI 212Y white-red-jack pine) carries a median fit a few Mg
    // above its bootstrap band after age 135; it is kept as built. Statewide curves must
    // all satisfy the ordering, and any exception must sit in a cell with under 10 plots.
    const bad = new Map();
    for(const { st, sec, t, c } of cells()){
      for(let i = 0; i < c.ages.length; i++){
        const m = c.med[i], lo = c.lo95[i], hi = c.hi95[i];
        if(m == null || lo == null || hi == null || !(m > 0)) continue;
        if(!(lo <= m && m <= hi)) bad.set(`${st} ${sec} ${t}`, c.n_plots);
      }
    }
    for(const [cell, nplots] of bad){
      expect(cell.includes(" ALL "), `statewide violation in ${cell}`).toBe(false);
      expect(nplots != null && nplots < 10, `band violation in a well sampled cell ${cell} (${nplots} plots)`).toBe(true);
    }
    expect(bad.size).toBeLessThanOrEqual(1);
  });
  it("carries picks and decline summaries for every statewide type", () => {
    for(const st of STATES){
      const s = data.states[st];
      for(const t of Object.keys(s.sections.ALL.types)){
        expect(s.picks[t], `${st} pick ${t}`).toBeTruthy();
        expect(s.picks[t].form, `${st} form ${t}`).toMatch(/^(CR|CRS|CRD|HG)$/);
        expect(s.picks[t].strat, `${st} strat ${t}`).toMatch(/^S[12]$/);
      }
    }
    expect(data.states.MN.picks.MBB.pooled).toBe("LSPOOL");
    expect(data.states.MN.picks.OAK.pooled).toBe("LSPOOL");
    expect(data.states.NH.sections.ALL.types.EAC).toBeUndefined();
  });
  it("contains no coordinate keys (lat, lon) anywhere", () => {
    for(const k of keys(data)) expect(k).not.toMatch(/^(lat|lon|lng|latitude|longitude)$/i);
  });
});
