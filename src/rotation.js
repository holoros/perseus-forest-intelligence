// Faustmann rotation economics for Build a run (pure, no React).
//
// Given a merchantable-volume curve [[age, cu ft/ac], ...], a stumpage price ($/cu ft) and a
// discount rate, choose the rotation age R* that maximizes the land expectation value
//
//   LEV(R) = NPV(R) * (1+r)^R / ((1+r)^R - 1)
//
// where NPV(R) is the single-rotation net present value of one harvest at R (revenue at R
// discounted to age 0, less establishment cost at age 0 and the present value of annual
// management cost over the rotation; both costs default to 0, so the default is gross).
//
// Maximizing the single-rotation NPV instead (the Fisher rotation) picks a longer R and
// understates the Faustmann LEV: the 1 October 2026 reconciliation found about 16 percent
// on the Maine 5.3.1 harvested curve ($179 vs $207 ac-1). The LEV-maximizing R is always at
// or below the NPV-maximizing R, because the perpetual factor (1+r)^R / ((1+r)^R - 1)
// declines in R and so rewards an earlier harvest.
//
// The search runs over an annual grid R = R_MIN..R_MAX. With one blended price on all
// merchantable volume there is no sawlog premium pulling R out, so on fast-rising curves the
// LEV optimum can sit at the grid minimum; `atGridMin` flags that so the UI can say so.

export const R_MIN = 10;
export const R_MAX = 120;

// Piecewise-linear interpolation of the merchantable volume curve, flat beyond the last age
// and linear from the origin below the first.
export function volumeAt(merch, a) {
  if (a <= merch[0][0]) return merch[0][1] * a / Math.max(merch[0][0], 1);
  for (let i = 1; i < merch.length; i++) {
    if (a <= merch[i][0]) {
      const [x0, y0] = merch[i - 1], [x1, y1] = merch[i];
      return y0 + (y1 - y0) * (a - x0) / ((x1 - x0) || 1);
    }
  }
  return merch[merch.length - 1][1];
}

// Present value of a $1/yr annuity over R years.
export function annuityFactor(R, disc) {
  return disc > 0 ? (1 - Math.pow(1 + disc, -R)) / disc : R;
}

// Perpetual-series factor that turns one rotation's NPV into an LEV: (1+r)^R / ((1+r)^R - 1).
export function perpetualFactor(R, disc) {
  if (!(disc > 0)) return Infinity;
  const g = Math.pow(1 + disc, R);
  return g / (g - 1);
}

export function rotationTimber(merch, stumpageCuft, disc, estCost = 0, mgmtCost = 0) {
  if (!merch || merch.length < 2) return null;
  const srNPV = (R) => volumeAt(merch, R) * stumpageCuft * Math.pow(1 + disc, -R)
    - estCost - mgmtCost * annuityFactor(R, disc);
  const lev = (R) => srNPV(R) * perpetualFactor(R, disc);

  let bestLEV = -Infinity, R = R_MIN;          // Faustmann: R* maximizes LEV
  let bestNPV = -Infinity, rNPV = R_MIN;       // Fisher rotation, kept for reference
  for (let a = R_MIN; a <= R_MAX; a++) {
    const v = srNPV(a), l = lev(a);
    if (v > bestNPV) { bestNPV = v; rNPV = a; }
    if (l > bestLEV) { bestLEV = l; R = a; }
  }
  if (!(disc > 0)) {
    // Undiscounted: LEV is unbounded, fall back to the NPV-maximizing age and report no LEV.
    return { npv: bestNPV, rotation: rNPV, lev: null, rotationNPV: rNPV, npvAtRotationNPV: bestNPV, atGridMin: rNPV === R_MIN };
  }
  return {
    npv: srNPV(R),            // single-rotation NPV at the LEV-maximizing R*
    rotation: R,              // R* (maximizes LEV)
    lev: bestLEV,             // Faustmann LEV, gross of costs unless estCost/mgmtCost given
    rotationNPV: rNPV,        // the Fisher rotation (maximizes single-rotation NPV)
    npvAtRotationNPV: bestNPV,
    atGridMin: R === R_MIN,   // R* pinned at the lower edge of the grid
  };
}
