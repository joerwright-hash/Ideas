import './HazardResults.css'

const HAZARD_ICONS = {
  'Flood Plains':               '🌊',
  'Flood Prone Areas':          '🌊',
  'Flood Sensitive Areas':      '💧',
  'Overland Flow Paths':        '💧',
  'Coastal Inundation':         '🌊',
  'Coastal Erosion':            '🏖️',
  'Mean High Water Springs':    '🌊',
  'Landslide Susceptibility':   '⛰️',
  'Tsunami Evacuation Zones':   '🌊',
  'Liquefaction':               '🏔️',
  'Storm Surge':                '⛈️',
  'Volcanic Hazard':            '🌋',
  default:                      '⚠️',
}

const HAZARD_COLORS = {
  'Flood Plains':               '#1d4ed8',
  'Flood Prone Areas':          '#1d4ed8',
  'Flood Sensitive Areas':      '#0369a1',
  'Overland Flow Paths':        '#0369a1',
  'Coastal Inundation':         '#0891b2',
  'Coastal Erosion':            '#b45309',
  'Mean High Water Springs':    '#0891b2',
  'Landslide Susceptibility':   '#92400e',
  'Tsunami Evacuation Zones':   '#1d4ed8',
  'Liquefaction':               '#78350f',
  'Storm Surge':                '#6d28d9',
  'Volcanic Hazard':            '#991b1b',
  default:                      '#374151',
}

// ── Risk band colour palette ───────────────────────────────────────────────
const BAND_CONFIG = {
  'very-low': { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  'low':      { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  'moderate': { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  'high':     { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' },
  'very-high':{ bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
}

// Resolve icon/color for layer types that are substrings of the key
function resolveByType(map, type) {
  // exact match first
  if (map[type]) return map[type]
  // substring match
  const key = Object.keys(map).find(k => k !== 'default' && type.toLowerCase().includes(k.toLowerCase()))
  return key ? map[key] : map.default
}

// ── Overall Risk Band card ─────────────────────────────────────────────────
function RiskBandCard({ scores, scenarioLabel, horizonLabel }) {
  if (!scores) return null
  const cfg = BAND_CONFIG[scores.band] ?? BAND_CONFIG['moderate']

  const context = horizonLabel === 'Today'
    ? 'current conditions'
    : `${scenarioLabel} in ${horizonLabel}`

  return (
    <div
      className="risk-band-card"
      style={{ '--band-bg': cfg.bg, '--band-border': cfg.border, '--band-text': cfg.text }}
    >
      <div className="risk-band-label">Overall Risk Score</div>
      <div className="risk-band-value">{scores.total}/5 — {scores.bandLabel}</div>
      <p className="risk-band-context">
        Highest hazard score across {scores.perHazard.length} hazard
        {scores.perHazard.length !== 1 ? 's' : ''} under {context}.
        A single high-risk hazard drives the overall score.
      </p>
    </div>
  )
}

// ── Per-hazard score badge ─────────────────────────────────────────────────
function ScoreBadge({ score, severity, delta }) {
  return (
    <div className="hazard-score">
      <span className="hazard-score-num">{score}</span>
      <span className="hazard-score-max">/5</span>
      {severity && <span className="hazard-score-severity">{severity}</span>}
      {delta > 0 && (
        <span className="hazard-score-delta" title="Climate-adjusted increase">
          +{delta}
        </span>
      )}
    </div>
  )
}

// ── Individual hazard card ─────────────────────────────────────────────────
function HazardCard({ hazard, explanation, scoreEntry, loadingExplain }) {
  const icon  = resolveByType(HAZARD_ICONS, hazard.type)
  const color = resolveByType(HAZARD_COLORS, hazard.type)

  return (
    <div className="hazard-card" style={{ '--hazard-color': color }}>
      <div className="hazard-header">
        <span className="hazard-icon">{icon}</span>
        <div className="hazard-meta">
          <h3 className="hazard-type">{hazard.type}</h3>
          <span className="hazard-source">{hazard.source}</span>
        </div>
        {scoreEntry && (
          <ScoreBadge score={scoreEntry.score} severity={scoreEntry.severity} delta={scoreEntry.delta} />
        )}
      </div>

      {loadingExplain ? (
        <div className="hazard-explanation hazard-explanation--loading">
          <span className="explain-shimmer" />
        </div>
      ) : explanation ? (
        <div className="hazard-explanation">
          <p>{explanation}</p>
        </div>
      ) : null}

      {hazard.attributes && Object.keys(hazard.attributes).length > 0 && (
        <details className="hazard-raw">
          <summary>Raw council data</summary>
          <div className="hazard-attrs">
            {Object.entries(hazard.attributes)
              .filter(([, v]) => v !== null && v !== '' && v !== undefined)
              .map(([k, v]) => (
                <div key={k} className="hazard-attr-row">
                  <span className="attr-key">{k}</span>
                  <span className="attr-val">{String(v)}</span>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── RiskSummary ────────────────────────────────────────────────────────────
export default function RiskSummary({
  hazards,
  explanations,
  scores,
  loadingExplain,
  scenarioLabel,
  horizonLabel,
}) {
  if (!hazards || hazards.length === 0) {
    return (
      <section className="card hazard-results">
        <RiskBandCard scores={scores} scenarioLabel={scenarioLabel} horizonLabel={horizonLabel} />
        <h2 className="card-title" style={{ marginTop: 16 }}>
          <span className="card-title-icon">✅</span>
          Risk Summary
        </h2>
        <div className="no-hazards">
          <div className="no-hazards-icon">✅</div>
          <p className="no-hazards-title">No mapped hazards found</p>
          <p className="no-hazards-body">
            No mapped hazards were found at this location based on available Auckland Council data.
            This does not guarantee the property is risk-free — always seek professional advice before purchasing.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="card hazard-results">
      <RiskBandCard scores={scores} scenarioLabel={scenarioLabel} horizonLabel={horizonLabel} />

      <h2 className="card-title" style={{ marginTop: 16 }}>
        <span className="card-title-icon">⚠️</span>
        Hazard Detail
        <span className="hazard-count">
          {hazards.length} hazard{hazards.length !== 1 ? 's' : ''} found
        </span>
      </h2>

      <div className="hazard-list">
        {hazards.map((h, i) => (
          <HazardCard
            key={i}
            hazard={h}
            explanation={explanations?.[i]}
            scoreEntry={scores?.perHazard[i]}
            loadingExplain={loadingExplain}
          />
        ))}
      </div>

      <p className="hazard-disclaimer">
        ℹ️ Data from Auckland Council ArcGIS services. Risk scores and future scenarios are
        indicative only — consult a licensed professional before making property decisions.
      </p>
    </section>
  )
}
