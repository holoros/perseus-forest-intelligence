// Unit conversion for the metric / Imperial toggle. Practitioners use Imperial
// (ton/ac, sq ft/ac, $/MBF); scientists use metric (Mg/ha, m²/ha, $/m³). Values
// are stored Imperial; convert at display time keyed on the unit string.

const FACTORS = {
  "ton/ac":   ["Mg/ha", 2.241702],
  "ton C/ac": ["Mg C/ha", 2.241702],
  "sq ft/ac": ["m²/ha", 0.2295684],
  "cu ft/ac": ["m³/ha", 0.06997245],
  "$/ac":     ["$/ha", 2.471054],
  "$/MBF":    ["$/m³", 1/2.359737],   // 1 MBF ≈ 2.36 m³
  "$/cord":   ["$/m³", 1/2.54858],    // 1 cord ≈ 2.55 m³ solid wood
  "per ac":   ["per ha", 2.471054],   // trees per acre -> per hectare
};

// House unit style for display: SI multiplicative form with true superscripts, never a
// slash. "Mg/ha/yr" -> "Mg ha⁻¹ yr⁻¹", "sq ft/ac" -> "ft² ac⁻¹", "per ac" -> "ac⁻¹",
// "$/MBF" -> "$ MBF⁻¹". Factors are separated by a thin space (U+2009). Strings without a
// slash or "per" pass through apart from the square and cube shorthands.
const SUP = { "2": "²", "3": "³" };
const THIN = "\u2009";
function powerize(tok) {
  return tok.replace(/^sq\s*ft$/i, "ft²").replace(/^cu\s*ft$/i, "ft³")
            .replace(/^sq\s*m$/i, "m²").replace(/^cu\s*m$/i, "m³")
            .replace(/\b(m|ft|cm|km)([23])\b/g, (_, b, e) => b + SUP[e]);
}
export function fmtUnit(unit) {
  if (unit == null || typeof unit !== "string") return unit;
  let u = unit.trim();
  const per = u.match(/^per\s+(.+)$/i);
  if (per) return powerize(per[1]) + "⁻¹";
  if (!u.includes("/")) return powerize(u);
  const [num, ...dens] = u.split("/").map((t) => t.trim()).filter((t) => t.length);
  const head = num ? powerize(num) : "";
  const tail = dens.map((d) => {
    const p = powerize(d);
    // "m²" as a denominator becomes "m⁻²"; plain units get ⁻¹
    const m = p.match(/^(.*?)([²³])$/);
    return m ? m[1] + (m[2] === "²" ? "⁻²" : "⁻³") : p + "⁻¹";
  });
  return [head, ...tail].filter(Boolean).join(THIN);
}

// Convert a numeric value with a given Imperial unit string to the active system.
// Returns { value, unit }. Unknown units (yr, %, index, …) pass through unchanged.
export function conv(value, unit, system){
  if(value == null) return { value, unit: fmtUnit(unit) };
  if(system !== "metric") return { value, unit: fmtUnit(unit) };
  const f = FACTORS[unit];
  if(!f) return { value, unit: fmtUnit(unit) };
  return { value: value * f[1], unit: fmtUnit(f[0]) };
}

// Just the active unit label for a stored Imperial unit.
export function unitLabel(unit, system){
  if(system !== "metric") return fmtUnit(unit);
  const f = FACTORS[unit];
  return fmtUnit(f ? f[0] : unit);
}

// Area helpers (AOI stores m²; show the system's primary unit prominently).
export function fmtArea(m2, system){
  if(!m2) return "n/a";
  const ac = m2 / 4046.8564224, ha = m2 / 1e4;
  if(system === "metric")
    return ha >= 1000 ? `${Math.round(ha).toLocaleString()} ha (${Math.round(ac).toLocaleString()} ac)`
                      : `${ha.toFixed(0)} ha (${ac.toFixed(0)} ac)`;
  return ac >= 1000 ? `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`
                    : `${ac.toFixed(0)} ac (${ha.toFixed(0)} ha)`;
}
