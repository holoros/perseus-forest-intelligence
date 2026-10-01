import { describe, it, expect } from "vitest";
import { median, percentile } from "../../src/rasterSample.js";

describe("median", () => {
  it("handles odd, even, unsorted and empty input without mutating it", () => {
    const a = [5, 1, 3];
    expect(median(a)).toBe(3);
    expect(a).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median(null)).toBeNull();
  });
});

describe("percentile", () => {
  const d = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it("returns the share of the distribution at or below the value", () => {
    expect(percentile(5, d)).toBe(0.5);
    expect(percentile(0, d)).toBe(0);
    expect(percentile(10, d)).toBe(1);
  });
  it("returns null for missing inputs", () => {
    expect(percentile(null, d)).toBeNull();
    expect(percentile(3, [])).toBeNull();
  });
});
