import { describe, it, expect } from "vitest";
import { rotationTimber, volumeAt, perpetualFactor, R_MIN, R_MAX } from "../../src/rotation.js";

// Synthetic Chapman-Richards merchantable volume curve, V(a) = A (1 - exp(-k a))^p,
// sampled every 5 yr like the per-acre yield curves Build a run consumes.
function chapmanRichards(A = 4000, k = 0.035, p = 2.5, step = 5, maxAge = 150) {
  const pts = [];
  for (let a = step; a <= maxAge; a += step) pts.push([a, A * Math.pow(1 - Math.exp(-k * a), p)]);
  return pts;
}

// Brute-force the two optima on the same annual grid, independently of rotationTimber.
function bruteForce(merch, price, disc) {
  let bestNPV = -Infinity, rNPV = R_MIN, bestLEV = -Infinity, rLEV = R_MIN;
  for (let R = R_MIN; R <= R_MAX; R++) {
    const npv = volumeAt(merch, R) * price * Math.pow(1 + disc, -R);
    const lev = npv * perpetualFactor(R, disc);
    if (npv > bestNPV) { bestNPV = npv; rNPV = R; }
    if (lev > bestLEV) { bestLEV = lev; rLEV = R; }
  }
  return { bestNPV, rNPV, bestLEV, rLEV };
}

describe("rotationTimber (Faustmann LEV rotation)", () => {
  const merch = chapmanRichards();
  const price = 0.25;   // $/cu ft

  it("picks R* that maximizes LEV, and R*_LEV <= R*_NPV", () => {
    for (const disc of [0.03, 0.04, 0.05, 0.07]) {
      const r = rotationTimber(merch, price, disc);
      const bf = bruteForce(merch, price, disc);
      expect(r.rotation).toBe(bf.rLEV);
      expect(r.rotationNPV).toBe(bf.rNPV);
      expect(r.lev).toBeCloseTo(bf.bestLEV, 6);
      expect(r.rotation).toBeLessThanOrEqual(r.rotationNPV);
    }
  });

  it("LEV at R*_LEV >= LEV at R*_NPV, and the single-rotation NPV is reported at R*_LEV", () => {
    const disc = 0.04;
    const r = rotationTimber(merch, price, disc);
    const levAtRnpv = r.npvAtRotationNPV * perpetualFactor(r.rotationNPV, disc);
    expect(r.lev).toBeGreaterThanOrEqual(levAtRnpv);
    // On this curve the two rotations differ, so the Fisher capitalization understates LEV.
    expect(r.rotation).toBeLessThan(r.rotationNPV);
    expect(r.lev).toBeGreaterThan(levAtRnpv);
    const npvAtR = volumeAt(merch, r.rotation) * price * Math.pow(1 + disc, -r.rotation);
    expect(r.npv).toBeCloseTo(npvAtR, 9);
    expect(r.npv).toBeLessThanOrEqual(r.npvAtRotationNPV);
  });

  it("flags R* pinned at the grid minimum", () => {
    // Very fast-rising curve: volume is nearly at the asymptote by age 10, so LEV peaks at R_MIN.
    const fast = chapmanRichards(4000, 0.6, 1.2);
    const r = rotationTimber(fast, price, 0.05);
    expect(r.rotation).toBe(R_MIN);
    expect(r.atGridMin).toBe(true);
    const slow = rotationTimber(merch, price, 0.04);
    expect(slow.atGridMin).toBe(false);
  });

  it("handles degenerate inputs", () => {
    expect(rotationTimber(null, price, 0.04)).toBeNull();
    expect(rotationTimber([[10, 100]], price, 0.04)).toBeNull();
    const r0 = rotationTimber(merch, price, 0);
    expect(r0.lev).toBeNull();
    expect(r0.rotation).toBe(r0.rotationNPV);
  });

  it("entered establishment and management costs reduce LEV", () => {
    const gross = rotationTimber(merch, price, 0.04);
    const net = rotationTimber(merch, price, 0.04, 100, 5);
    expect(net.lev).toBeLessThan(gross.lev);
  });
});
