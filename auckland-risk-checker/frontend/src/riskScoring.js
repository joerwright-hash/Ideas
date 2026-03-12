/**
 * riskScoring.js — Auckland Property Risk Scoring
 *
 * Pure functions: no network calls, no side effects.
 * Called with `useMemo` in App.jsx so scores update instantly when the user
 * changes scenario or time horizon, without re-fetching any data.
 *
 * Scoring framework (per spec):
 *   Base score per hazard  →  0 (not present) to 3 (high severity)
 *   Climate adjustment      →  +0 to +2 depending on scenario + horizon
 *   Per-hazard cap          →  4 points
 *   Total → risk band:  0-2 Low | 3-5 Moderate | 6-8 High | 9+ Very High
 */

// ── Scenario / horizon options ─────────────────────────────────────────────
// These are the ONLY labels shown in the UI — RCP values are never exposed.
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

// ── Climate adjustments ────────────────────────────────────────────────────
// Two hazard groups respond to climate change:
//   rainfall → Flooding, Overland Flow, Landslip (driven by heavier rain)
//   coastal  → Coastal Inundation, Storm Surge (driven by sea level rise)
// Liquefaction is geology-driven: no climate adjustment.
//
// Coastal deltas are calibrated against NZ SeaRise / MfE (2024) Table 6,
// which gives approximate years for absolute SLR heights under each SSP:
//
//   Scenario mapping:
//     lower   ≈ SSP1-2.6 median  (~0.3 m by 2090, ~0.2 m by 2050)
//     current ≈ SSP2-4.5 median  (~0.5–0.6 m by 2090, ~0.2 m by 2045)
//     high    ≈ SSP5-8.5 median  (~0.7–0.8 m by 2090, ~0.2 m by 2040)
//
//   By 2040 the scenarios have not yet meaningfully diverged (~0.2 m across
//   the board), so 'current' and 'high' share the same +1 coastal delta.
//   By 2090 the spread is large (0.3 m vs 0.8 m), so 'high' is scored +2
//   while 'current' is scored +1 to reflect that differentiation.
const ADJUSTMENTS = {
  lower: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 0, coastal: 0 },
    2090:  { rainfall: 1, coastal: 1 },
  },
  current: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 1, coastal: 1 },
    2090:  { rainfall: 2, coastal: 1 },  // ~0.5–0.6 m SLR (SSP2-4.5 median)
  },
  high: {
    today: { rainfall: 0, coastal: 0 },
    2040:  { rainfall: 1, coastal: 1 },
    2090:  { rainfall: 2, coastal: 2 },  // ~0.7–0.8 m SLR (SSP5-8.5 median)
  },
}

// ── Hazard → adjustment group ──────────────────────────────────────────────
function hazardGroup(type) {
  if (['Flooding', 'Overland Flow', 'Landslip'].includes(type)) return 'rainfall'
  if (['Coastal Inundation', 'Storm Surge'].includes(type))      return 'coastal'
  return 'other' // Liquefaction, Tsunami, Volcanic — no climate adjustment
}

// ── Base score from ArcGIS attribute values ────────────────────────────────
// We don't know the exact attribute names from each layer in advance, so we
// search all attribute values for severity keywords.
// If none are found, we default to 2 (moderate) — the property IS in a zone.
function baseScore(hazard) {
  const vals = Object.values(hazard.attributes || {}).map(v => String(v).toLowerCase())
  const has = (...kws) => vals.some(v => kws.some(k => v.includes(k)))

  switch (hazard.type) {
    case 'Flooding':
    case 'Overland Flow':
      if (has('very high', 'high', 'frequent')) return 3
      return 2

    case 'Coastal Inundation':
    case 'Storm Surge':
      if (has('very high', 'frequent', 'permanent')) return 3
      return 2

    case 'Liquefaction':
      if (has('very high')) return 3
      if (has('high'))      return 2
      return 1  // low / present in zone

    case 'Landslip':
      if (has('very high')) return 3
      if (has('high'))      return 2
      return 1  // moderate

    default:
      return 2  // present in some other hazard zone
  }
}

// ── Main export: compute scores for the full hazard list ───────────────────
// Returns:
//   perHazard  — [{ type, base, delta, score }]  one entry per hazard
//   total      — sum of all hazard scores
//   band       — css-safe key: 'low' | 'moderate' | 'high' | 'very-high'
//   bandLabel  — display text: 'Low' | 'Moderate' | 'High' | 'Very High'
export function computeScores(hazards, scenario, horizon) {
  const adj = ADJUSTMENTS[scenario]?.[horizon] ?? { rainfall: 0, coastal: 0 }

  const perHazard = hazards.map(h => {
    const base  = baseScore(h)
    const group = hazardGroup(h.type)
    const delta = group === 'rainfall' ? adj.rainfall
                : group === 'coastal'  ? adj.coastal
                : 0
    const score = Math.min(4, base + delta)  // cap at 4 per hazard
    return { type: h.type, base, delta, score }
  })

  const total = perHazard.reduce((sum, h) => sum + h.score, 0)

  let band, bandLabel
  if      (total <= 2) { band = 'low';      bandLabel = 'Low' }
  else if (total <= 5) { band = 'moderate'; bandLabel = 'Moderate' }
  else if (total <= 8) { band = 'high';     bandLabel = 'High' }
  else                 { band = 'very-high';bandLabel = 'Very High' }

  return { perHazard, total, band, bandLabel }
}
