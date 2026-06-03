// Unit conversion for the metric / Imperial toggle. Practitioners use Imperial
// (ton/ac, sq ft/ac, $/MBF); scientists use metric (Mg/ha, m²/ha, $/m³). Values
// are stored Imperial; convert at display time keyed on the unit string.

const FACTORS = {
  "ton/ac":   ["Mg/ha", 2.241702],
  "ton C/ac": ["Mg C/ha", 2.241702],
  "sq ft/ac": ["m²/ha", 0.2295684],
  "cu ft/ac": ["m³/ha", 0.0699742],
  "$/ac":     ["$/ha", 2.471054],
  "$/MBF":    ["$/m³", 1/2.359737],   // 1 MBF ≈ 2.36 m³
  "$/cord":   ["$/m³", 1/2.54858],    // 1 cord ≈ 2.55 m³ solid wood
  "per ac":   ["per ha", 2.471054],   // trees per acre -> per hectare
};

// Convert a numeric value with a given Imperial unit string to the active system.
// Returns { value, unit }. Unknown units (yr, %, index, …) pass through unchanged.
export function conv(value, unit, system){
  if(value == null) return { value, unit };
  if(system !== "metric") return { value, unit };
  const f = FACTORS[unit];
  if(!f) return { value, unit };
  return { value: value * f[1], unit: f[0] };
}

// Just the active unit label for a stored Imperial unit.
export function unitLabel(unit, system){
  if(system !== "metric") return unit;
  const f = FACTORS[unit];
  return f ? f[0] : unit;
}

// Area helpers (AOI stores m²; show the system's primary unit prominently).
export function fmtArea(m2, system){
  if(!m2) return "—";
  const ac = m2 / 4046.8564224, ha = m2 / 1e4;
  if(system === "metric")
    return ha >= 1000 ? `${Math.round(ha).toLocaleString()} ha (${Math.round(ac).toLocaleString()} ac)`
                      : `${ha.toFixed(0)} ha (${ac.toFixed(0)} ac)`;
  return ac >= 1000 ? `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`
                    : `${ac.toFixed(0)} ac (${ha.toFixed(0)} ha)`;
}
