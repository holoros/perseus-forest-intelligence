import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Structural checks on the RD threshold store
// (scripts/build_rd_thresholds.py -> public/api/rd_thresholds_l3.json).
const data = JSON.parse(readFileSync(new URL("../../public/api/rd_thresholds_l3.json", import.meta.url), "utf8"));

describe("rd_thresholds_l3.json", () => {
  it("carries the national breakpoints exactly as published", () => {
    expect(data.schema).toBe("perseus_rd_thresholds_v1");
    expect(data.national.gross_growth).toBe(0.42);
    expect(data.national.net_growth).toBe(0.34);
    expect(data.national.net_growth_profile_interval).toEqual([0.33, 0.36]);
    expect(data.national.mortality_incidence).toBe(0.45);
    expect(data.national.mortality_severity).toBe(0.50);
    expect(data.national.pooled_cells.gross).toEqual({ mean: 0.443, n_cells: 285, pi95_new_cell: [0.37, 0.52] });
    expect(data.national.pooled_cells.net).toEqual({ mean: 0.447, n_cells: 265, pi95_new_cell: [0.35, 0.55] });
    expect(data.source.doi).toBe("10.5281/zenodo.23397937");
  });
  it("holds 2,020 type by ecoregion rows with ordered intervals and known source codes", () => {
    let n = 0;
    for(const [code, eco] of Object.entries(data.l3)){
      expect(eco.name, code).toBeTruthy();
      for(const t of eco.types){
        n++;
        for(const k of ["g", "n", "inc", "sev"]){
          const [v, lo, hi] = t[k];
          expect(lo <= v && v <= hi, `${code} ${t.ft} ${k}`).toBe(true);
          expect(data.source_codes[t.src[k]], `${code} ${t.ft} ${k} source`).toBeTruthy();
        }
        expect(t.pairs).toBeGreaterThanOrEqual(1);
      }
    }
    expect(n).toBe(2020);
  });
  it("maps every CONUS state to ecoregions that exist in the table", () => {
    const states = Object.keys(data.state_l3);
    expect(states.length).toBe(48);
    for(const st of states){
      expect(data.state_l3[st].length, st).toBeGreaterThan(0);
      for(const c of data.state_l3[st]) expect(data.l3[c], `${st} -> ${c}`).toBeTruthy();
    }
    // Spot checks against the EPA Level III map: Acadian Plains and Hills is Maine only.
    expect(data.state_l3.ME).toContain("82");
    expect(data.state_l3.NH).not.toContain("82");
    expect(data.state_l3.MN).toContain("50");
  });
});
