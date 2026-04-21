/**
 * riskScoring.js — Auckland Property Risk Scoring
 *
 * Pure functions: no network calls, no side effects.
 * Called with `useMemo` in App.jsx so scores update instantly when the user
 * changes scenario or time horizon, without re-fetching any data.
 *
 * Scoring framework:
 *   Per-hazard score   →  1 (Very Low) to 5 (Very High)
 *   Climate adjustment →  +0 to +2 depending on scenario + horizon
 *   Per-hazard cap     →  5
 *   Overall score      →  max of individual hazard scores (not sum)
 *   This prevents a single Very High hazard being masked by averaging.
 */

// ── Scenario / horizon options ─────────────────────────────────────────────
export const SCENARIOS = [
  {
    id: 'lower',
    label: 'Lower warming future',
    tooltip: 'Strong global emissions cuts (broadly SSP1-2.6). Projects ~0.3 m of sea-level rise by 2090 for NZ. Represents an optimistic but still plausible pathway.',
  },
  {
    id: 'current',
    label: 'Current trajectory',
    tooltip: 'Moderate mitigation, roughly aligned with current global policies (broadly SSP2-4.5). Projects ~0.5–0.6 m of sea-level rise by 2090 for NZ.',
  },
  {
    id: 'high',
    label: 'High warming future',
    tooltip: 'High-emissions scenario with little mitigation (broadly SSP5-8.5). Projects ~0.7–0.8 m of sea-level rise by 2090 for NZ. Used as a stress-test for planning.',
  },
]

export const HORIZONS = [
  { id: 'today', label: 'Today' },
  { id: '2040',  label: '2040' },
  { id: '2090',  label: '2090' },
]

// ── Severity labels ────────────────────────────────────────────────────────
export const SEVERITY_LABELS = {
  1: 'Very Low',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Very High',
}

const SCORE_TO_BAND = {
  1: 'very-low',
  2: 'low',
  3: 'moderate',
  4: 'high',
  5: 'very-high',
}

// ── Climate adjustments ────────────────────────────────────────────────────
// Two hazard groups respond to climate change:
//   rainfall → Flood, Overland Flow, Landslide (driven by heavier rain)
//   coastal  → Coastal Inundation, Storm Surge, Coastal Erosion (SLR)
//
// Calibrated against NZ SeaRise / MfE (2024) Table 6:
//   lower   ≈ SSP1-2.6 median  (~0.3 m by 2090)
//   current ≈ SSP2-4.5 median  (~0.5–0.6 m by 2090)
//   high    ≈ SSP5-8.5 median  (~0.7–0.8 m by 2090)
//
//   By 2040 scenarios have not yet meaningfully diverged (~0.2 m across all),
//   so current/high share the same +1 coastal delta.
//   By 2090 the spread is large, so high is +2 while current stays +1.
const ADJUSTMENTS = {
  lower: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 0, coastal: 0 },
    2090:  { rainfall: 1, coastal: 1 },
  },
  current: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 1, coastal: 1 },
    2090:  { rainfall: 2, coastal: 1 },
  },
  high: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 1, coastal: 1 },
    2090:  { rainfall: 2, coastal: 2 },
  },
}

// ── Hazard → adjustment group ──────────────────────────────────────────────
// Uses substring matching because layer type strings are long and varied.
function hazardGroup(type) {
  const t = type.toLowerCase()
  if (t.includes('flood') || t.includes('overland flow') || t.includes('landslide') || t.includes('landslip')) {
    return 'rainfall'
  }
  if (t.includes('coastal') || t.includes('storm surge') || t.includes('mean high water') || t.includes('erosion')) {
    return 'coastal'
  }
  return 'other' // Tsunami, Liquefaction — no climate adjustment
}

// ── Base score from ArcGIS attribute values (1–5 scale) ───────────────────
// Searches all attribute values for severity keywords.
// Detected hazards start at a minimum of 2 (Low) — being in a mapped zone
// means something. Higher keywords push the score toward 4–5.
function baseScore(hazard) {
  const type = hazard.type.toLowerCase()
  const vals = Object.values(hazard.attributes || {}).map(v => String(v).toLowerCase())
  const has = (...kws) => vals.some(v => kws.some(k => v.includes(k)))

  if (type.includes('flood plain')) {
    // 1% AEP (100-year) floodplain — High by default
    if (has('very high', 'frequent')) return 5
    return 4
  }

  if (type.includes('flood prone') || type.includes('overland flow') || type.includes('flood sensitive')) {
    if (has('very high')) return 5
    if (has('high'))      return 4
    return 3
  }

  if (type.includes('coastal inundation') || type.includes('storm surge') || type.includes('mean high water')) {
    if (has('very high', 'frequent', 'permanent')) return 5
    return 3
  }

  if (type.includes('erosion')) {
    if (has('very high')) return 5
    if (has('high'))      return 4
    return 3
  }

  if (type.includes('landslide') || type.includes('landslip')) {
    if (has('very high')) return 5
    if (has('high'))      return 4
    return 2
  }

  if (type.includes('liquefaction')) {
    if (has('very high')) return 5
    if (has('high'))      return 4
    return 2
  }

  return 3 // default: detected in a hazard zone = Moderate
}

// ── Main export: compute scores for the full hazard list ───────────────────
// Returns:
//   perHazard  — [{ type, base, delta, score, severity }]
//   total      — max score across all hazards (not sum)
//   band       — css-safe key: 'very-low' | 'low' | 'moderate' | 'high' | 'very-high'
//   bandLabel  — display text matching SEVERITY_LABELS
export function computeScores(hazards, scenario, horizon) {
  const adj = ADJUSTMENTS[scenario]?.[horizon] ?? { rainfall: 0, coastal: 0 }

  const perHazard = hazards.map(h => {
    const base     = baseScore(h)
    const group    = hazardGroup(h.type)
    const delta    = group === 'rainfall' ? adj.rainfall
                   : group === 'coastal'  ? adj.coastal
                   : 0
    const score    = Math.min(5, base + delta)
    const severity = SEVERITY_LABELS[score]
    return { type: h.type, base, delta, score, severity }
  })

  const total     = perHazard.reduce((max, h) => Math.max(max, h.score), 0)
  const band      = SCORE_TO_BAND[total] ?? 'moderate'
  const bandLabel = SEVERITY_LABELS[total] ?? 'Moderate'

  return { perHazard, total, band, bandLabel }
}
