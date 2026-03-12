import { SCENARIOS, HORIZONS } from '../riskScoring'
import './ScenarioSelector.css'

/**
 * Two button-groups: one for warming scenario, one for time horizon.
 * Props:
 *   scenario        — active scenario id ('lower' | 'current' | 'high')
 *   horizon         — active horizon id  ('today' | '2040' | '2090')
 *   onScenario(id)  — called on scenario change
 *   onHorizon(id)   — called on horizon change
 *   loading         — disables buttons while explanations are re-fetching
 */
export default function ScenarioSelector({ scenario, horizon, onScenario, onHorizon, loading }) {
  return (
    <div className="scenario-selector">
      <div className="scenario-group">
        <span className="scenario-label">Warming scenario</span>
        <div className="btn-group">
          {SCENARIOS.map(s => (
            <div key={s.id} className="btn-tooltip-wrap">
              <button
                className={`btn-option${scenario === s.id ? ' active' : ''}`}
                onClick={() => onScenario(s.id)}
                disabled={loading}
                type="button"
              >
                {s.label}
              </button>
              {s.tooltip && (
                <span className="btn-tooltip" role="tooltip">{s.tooltip}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="scenario-group">
        <span className="scenario-label">Time horizon</span>
        <div className="btn-group">
          {HORIZONS.map(h => (
            <button
              key={h.id}
              className={`btn-option${horizon === h.id ? ' active' : ''}`}
              onClick={() => onHorizon(h.id)}
              disabled={loading}
              type="button"
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="scenario-updating">Updating explanations…</p>
      )}
    </div>
  )
}
