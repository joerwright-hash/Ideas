import { useState, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import AddressSearch from './components/AddressSearch'
import MapView from './components/MapView'
import RiskSummary from './components/RiskSummary'
import ScenarioSelector from './components/ScenarioSelector'
import { computeScores, SCENARIOS, HORIZONS } from './riskScoring'
import './App.css'

export default function App() {
  // Address / geocode result
  const [location, setLocation] = useState(null)        // { lat, lng, displayName }

  // Raw ArcGIS hazard data — fetched once per address search
  const [hazards, setHazards] = useState(null)          // hazard[]

  // Claude explanations — re-fetched when scenario or horizon changes
  const [explanations, setExplanations]     = useState(null)
  const [loadingExplain, setLoadingExplain] = useState(false)

  // Scenario + horizon selectors (default: current trajectory, today)
  const [scenario, setScenario] = useState('current')
  const [horizon,  setHorizon]  = useState('today')

  // Main loading + step indicator (only during initial address search)
  const [loading, setLoading] = useState(false)
  const [step,    setStep]    = useState('idle')  // idle | geocoding | checking | explaining | done
  const [error,   setError]   = useState(null)

  // ── Derived: risk scores update instantly from hazards + scenario + horizon ──
  // No fetch needed — pure computation via riskScoring.js
  const scores = useMemo(
    () => hazards ? computeScores(hazards, scenario, horizon) : null,
    [hazards, scenario, horizon],
  )

  // ── Helper: display labels for active scenario/horizon ──────────────────
  const scenarioLabel = SCENARIOS.find(s => s.id === scenario)?.label ?? ''
  const horizonLabel  = HORIZONS.find(h => h.id === horizon)?.label ?? ''

  // ── Fetch Claude explanations for current hazards + scenario + horizon ───
  async function fetchExplanations(hazardList, scen, horiz) {
    if (!hazardList || hazardList.length === 0) {
      setExplanations([])
      return
    }
    setLoadingExplain(true)
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hazards: hazardList.map(({ geometry, ...rest }) => rest),
          scenario: scen,
          horizon: horiz,
        }),
      })
      if (!res.ok) throw new Error('Explanation fetch failed')
      const data = await res.json()
      setExplanations(data.explanations)
    } catch (e) {
      console.error('Explain error:', e)
      setExplanations(null)
    } finally {
      setLoadingExplain(false)
    }
  }

  // ── Full address search: geocode → ArcGIS → Claude ──────────────────────
  async function handleSearch(address) {
    setError(null)
    setHazards(null)
    setExplanations(null)
    setLocation(null)
    setLoading(true)

    try {
      // Step 1: geocode
      setStep('geocoding')
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
      if (!geoRes.ok) {
        const err = await geoRes.json()
        throw new Error(err.error || 'Geocoding failed')
      }
      const geo = await geoRes.json()
      setLocation(geo)

      // Step 2: ArcGIS hazard query
      setStep('checking')
      const hazRes = await fetch(`/api/hazards?lat=${geo.lat}&lng=${geo.lng}`)
      if (!hazRes.ok) {
        const err = await hazRes.json()
        throw new Error(err.error || 'Hazard check failed')
      }
      const { hazards: found } = await hazRes.json()
      setHazards(found)

      // Step 3: Claude explanations (for default scenario + horizon)
      setStep('explaining')
      await fetchExplanations(found, scenario, horizon)

      setStep('done')
    } catch (e) {
      setError(e.message)
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  // ── Scenario / horizon change: re-fetch explanations only ───────────────
  function handleScenarioChange(newScenario) {
    setScenario(newScenario)
    if (hazards) fetchExplanations(hazards, newScenario, horizon)
  }

  function handleHorizonChange(newHorizon) {
    setHorizon(newHorizon)
    if (hazards) fetchExplanations(hazards, scenario, newHorizon)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">
            <span className="header-icon">🏡</span>
            <span className="header-brand">Auckland Property Risk Checker</span>
          </div>
          <p className="header-sub">Check hazard risks and future climate scenarios for your Auckland property</p>
        </div>
      </header>

      <main className="main">
        <AddressSearch onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="status-card">
            <div className="spinner" />
            <span className="status-text">
              {step === 'geocoding'  && 'Locating address…'}
              {step === 'checking'   && 'Checking Auckland Council hazard layers…'}
              {step === 'explaining' && 'Generating plain-English explanations…'}
            </span>
          </div>
        )}

        {/* Scenario + time selectors — shown once we have results */}
        {hazards !== null && !loading && (
          <ScenarioSelector
            scenario={scenario}
            horizon={horizon}
            onScenario={handleScenarioChange}
            onHorizon={handleHorizonChange}
            loading={loadingExplain}
          />
        )}

        {location && (
          <div className="results-grid">
            <section className="card map-card">
              <h2 className="card-title">
                <span className="card-title-icon">📍</span>
                Location
              </h2>
              <p className="location-name">{location.displayName}</p>
              <MapView lat={location.lat} lng={location.lng} hazards={hazards ?? []} />
            </section>

            {hazards !== null && (
              <RiskSummary
                hazards={hazards}
                explanations={explanations}
                scores={scores}
                loadingExplain={loadingExplain}
                scenarioLabel={scenarioLabel}
                horizonLabel={horizonLabel}
              />
            )}
          </div>
        )}

        {!location && !loading && !error && (
          <div className="empty-state">
            <div className="empty-icon">🗺️</div>
            <h2>Enter an Auckland address to get started</h2>
            <p>
              We'll check the property against Auckland Council hazard data and show how
              risk levels may change across different climate futures.
            </p>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-disclosure">
            <h3 className="footer-heading">About this tool</h3>
            <p>
              This tool is an <strong>indicative guide only</strong>. It is designed to help
              you understand how natural hazard risks at a specific Auckland property
              <em> might</em> change over time under different climate futures — not to
              provide a definitive or engineered assessment.
            </p>
            <p>
              Hazard zone data is sourced from <strong>Auckland Council ArcGIS services</strong> and
              reflects current council mapping. Climate scenario adjustments are based on
              sea-level rise projections from the <strong>NZ SeaRise platform</strong> and the
              Ministry for the Environment's medium-confidence guidance (2024), using a
              central New Zealand location as reference. Scenario labels correspond broadly
              to SSP1-2.6 (lower), SSP2-4.5 (current trajectory), and SSP5-8.5 (high).
              Rainfall risk adjustments are directional estimates only.
            </p>
            <p>
              <strong>Risk scores are ordinal and approximate.</strong> A higher score means
              relatively greater concern given available data — it does not represent an
              engineering probability or an insurance assessment. Scores should not be used
              as the sole basis for any significant financial, legal, or planning decision.
            </p>
            <p>
              Before purchasing, developing, or insuring a property, always consult a
              qualified engineer or planner, obtain a Land Information Memorandum (LIM) from
              Auckland Council, and seek independent professional advice.
            </p>
          </div>
          <p className="footer-legal">
            Data: Auckland Council · NZ SeaRise / MfE (2024) · For informational purposes only.
          </p>
        </div>
      </footer>
    </div>
  )
}
