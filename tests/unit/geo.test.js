import { describe, it, expect } from "vitest";
import { project, projectInverse, pointInRing, pointInGeometry, findFeature,
         polygonCentroid, polygonAreaM2, agbAtAge } from "../../src/geo.js";

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

describe("Albers projection", () => {
  it("maps the projection origin (96W, 37.5N) to (0, 0)", () => {
    const [x, y] = project(-96, 37.5);
    expect(Math.abs(x)).toBeLessThan(1e-12);
    expect(Math.abs(y)).toBeLessThan(1e-12);
  });
  it("round trips through the inverse across CONUS to < 1e-9 deg", () => {
    for (const [lon, lat] of [[-124.5, 48.9], [-67.0, 44.8], [-81.3, 25.2], [-104.9, 39.7], [-96, 37.5]]) {
      const [lo, la] = projectInverse(...project(lon, lat));
      expect(lo).toBeCloseTo(lon, 9);
      expect(la).toBeCloseTo(lat, 9);
    }
  });
  it("puts east of the central meridian at positive x and north at positive y", () => {
    expect(project(-80, 37.5)[0]).toBeGreaterThan(0);
    expect(project(-96, 45)[1]).toBeGreaterThan(0);
  });
});

describe("point in polygon", () => {
  const sq = box(0, 0, 10, 10);
  it("classifies inside and outside points, either winding", () => {
    expect(pointInRing(5, 5, sq)).toBe(true);
    expect(pointInRing(15, 5, sq)).toBe(false);
    expect(pointInRing(5, 5, sq.slice().reverse())).toBe(true);
  });
  it("respects holes and MultiPolygons", () => {
    const withHole = { type: "Polygon", coordinates: [sq, box(4, 4, 6, 6)] };
    expect(pointInGeometry(5, 5, withHole)).toBe(false);
    expect(pointInGeometry(2, 2, withHole)).toBe(true);
    const multi = { type: "MultiPolygon", coordinates: [[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]] };
    expect(pointInGeometry(5.5, 5.5, multi)).toBe(true);
    expect(pointInGeometry(3, 3, multi)).toBe(false);
    expect(pointInGeometry(0, 0, null)).toBe(false);
    expect(pointInGeometry(0, 0, { type: "Point", coordinates: [0, 0] })).toBe(false);
  });
  it("findFeature returns the containing feature or null", () => {
    const fs = [{ id: "a", geometry: { type: "Polygon", coordinates: [box(0, 0, 1, 1)] } },
                { id: "b", geometry: { type: "Polygon", coordinates: [box(2, 2, 3, 3)] } }];
    expect(findFeature(fs, 2.5, 2.5).id).toBe("b");
    expect(findFeature(fs, 9, 9)).toBeNull();
    expect(findFeature(undefined, 0, 0)).toBeNull();
  });
});

describe("centroid and area", () => {
  it("centroid of a rectangle is its center, and picks the largest part", () => {
    expect(polygonCentroid({ type: "Polygon", coordinates: [box(0, 0, 4, 2)] })).toEqual([2, 1]);
    const c = polygonCentroid({ type: "MultiPolygon", coordinates: [[box(0, 0, 1, 1)], [box(10, 10, 14, 14)]] });
    expect(c).toEqual([12, 12]);
  });
  it("area of a 1 x 1 degree cell at 44-45N is within 0.5% of the spherical value", () => {
    // Spherical (authalic radius) area: R^2 * dLon * (sin(lat2) - sin(lat1))
    const R = 6371007.2, d = Math.PI / 180;
    const ref = R * R * (1 * d) * (Math.sin(45 * d) - Math.sin(44 * d));
    const got = polygonAreaM2({ type: "Polygon", coordinates: [box(-70, 44, -69, 45)] });
    expect(Math.abs(got / ref - 1)).toBeLessThan(0.005);
  });
  it("subtracts holes and handles empty input", () => {
    const outer = polygonAreaM2({ type: "Polygon", coordinates: [box(-70, 44, -69, 45)] });
    const holed = polygonAreaM2({ type: "Polygon", coordinates: [box(-70, 44, -69, 45), box(-69.75, 44.25, -69.25, 44.75)] });
    expect(holed).toBeLessThan(outer);
    expect(holed / outer).toBeGreaterThan(0.7);
    expect(polygonAreaM2(null)).toBe(0);
  });
});

describe("agbAtAge", () => {
  const e = { curves: { agb_tonac: { untreated: [[40, 30.5], [50, 38.2]], thinned: [[50, 33]] } } };
  it("returns the curve value at the requested age and treatment", () => {
    expect(agbAtAge(e)).toBe(38.2);
    expect(agbAtAge(e, 40)).toBe(30.5);
    expect(agbAtAge(e, 50, "thinned")).toBe(33);
  });
  it("returns null for missing ages, treatments or entries", () => {
    expect(agbAtAge(e, 60)).toBeNull();
    expect(agbAtAge(e, 50, "clearcut")).toBeNull();
    expect(agbAtAge(null)).toBeNull();
  });
});
