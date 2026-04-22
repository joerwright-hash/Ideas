import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

// ─── Geocoding ─────────────────────────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
  const { address } = req.query
  if (!address) return res.status(400).json({ error: 'address is required' })

  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'nz',
    viewbox: '174.4,-36.6,175.3,-37.1',
    bounded: '0',
  })

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { 'User-Agent': 'AucklandPropertyRiskChecker/1.0' } },
    )
    const data = await response.json()
    if (!data.length) {
      return res.status(404).json({ error: 'Address not found. Try a more specific Auckland address.' })
    }
    const r = data[0]
    return res.json({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), displayName: r.display_name })
  } catch (err) {
    console.error('Geocoding error:', err)
    return res.status(500).json({ error: 'Geocoding service unavailable' })
  }
})

// ─── Auckland Council ArcGIS Hazard Layers ─────────────────────────────────
// ArcGIS-only — no Claude call here. Client calls /api/explain separately.
const HAZARD_LAYERS = [
  {
    type: 'Flood Prone Areas',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Flood_Prone_Areas/FeatureServer/0/query',
  },
  {
    type: 'Flood Plains',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Flood_Plains/FeatureServer/0/query',
  },
  {
    type: 'Coastal Inundation (1% AEP, 0.5m sea level rise)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Coastal_Inundation_1_AEP_05m_sea_level_rise/FeatureServer/0/query',
  },
  {
    type: 'Coastal Inundation (1% AEP, 1.0m sea level rise)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Coastal_Inundation_1_AEP_1m_sea_level_rise/FeatureServer/0/query',
  },
  {
    type: 'Coastal Inundation (1% AEP)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Coastal_Inundation_1_AEP/FeatureServer/0/query',
  },
  {
    type: 'Coastal Inundation (High Water Levels)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Coastal_Inundation_High_Water_Levels/FeatureServer/0/query',
  },
  {
    type: 'Flood Sensitive Areas',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Flood_Sensitive_Areas/FeatureServer/0/query',
  },
  {
    type: 'Landslide Susceptibility',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Large_Scale_Landslide_Susceptibility/FeatureServer/0/query',
  },
  {
    type: 'Tsunami Evacuation Zones',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Tsunami_Evacuation_Zones/FeatureServer/0/query',
  },
  {
    type: 'Mean High Water Springs (0.5m sea level rise)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Mean_High_Water_Springs_05m_sea_level_rise/FeatureServer/0/query',
  },
  {
    type: 'Mean High Water Springs (1.0m sea level rise)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Mean_High_Water_Springs_10m_sea_level_rise/FeatureServer/0/query',
  },
  {
    type: 'Coastal Inundation (100yr return, 1.0m sea level rise)',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Coastal_Inundation_100_yr_return_1m_sea_level_rise/FeatureServer/0/query',
  },
  {
    type: 'Overland Flow Paths',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/Overland_Flow_Paths/FeatureServer/0/query',
    buffer: 50, // polyline layer — query within 50 m of the property point
  },
  {
    type: 'Coastal Erosion',
    url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Susceptible_Areas_ASCIE_2130_RCP85_Regional/FeatureServer/0/query',
    buffer: 50, // polyline layer — query within 50 m of the property point
  },
]

// Convert ArcGIS JSON geometry → GeoJSON geometry
function toGeoJSON(geometry) {
  if (!geometry) return null
  if (geometry.rings)          return { type: 'Polygon',         coordinates: geometry.rings }
  if (geometry.paths)          return { type: 'MultiLineString',  coordinates: geometry.paths }
  if (geometry.x !== undefined)return { type: 'Point',            coordinates: [geometry.x, geometry.y] }
  return null
}

async function queryArcGISLayer(layer, lat, lng) {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    outFields: '*',
    returnGeometry: 'true',
    f: 'json',
  })

  if (layer.buffer) {
    params.set('distance', layer.buffer)
    params.set('units', 'esriSRUnit_Meter')
  }

  try {
    const response = await fetch(`${layer.url}?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'AucklandPropertyRiskChecker/1.0' },
    })
    if (!response.ok) {
      console.warn(`Layer "${layer.type}" HTTP ${response.status}`)
      return null
    }
    const data = await response.json()
    if (data.error) {
      console.warn(`Layer "${layer.type}" ArcGIS error:`, data.error.message)
      return null
    }
    if (!data.features || data.features.length === 0) return null

    const attrs = data.features[0].attributes || {}
    const filteredAttrs = {}
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === '' || v === undefined) continue
      if (k.startsWith('OBJECTID') || k === 'Shape__Area' || k === 'Shape__Length') continue
      filteredAttrs[k] = v
    }
    return {
      type: layer.type,
      source: 'Auckland Council',
      attributes: filteredAttrs,
      geometry: toGeoJSON(data.features[0].geometry),
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.warn(`Layer "${layer.type}" timed out`)
    } else {
      console.warn(`Layer "${layer.type}" error:`, err.message)
    }
    return null
  }
}

const AC_PROPERTY_URL = 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/ArcGIS/rest/services/AC_Property_Query/FeatureServer/0/query'

// GET /api/suggest — address autocomplete from AC_Property_Query
app.get('/api/suggest', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 3) return res.json({ suggestions: [] })

  const safe = q.replace(/[^a-zA-Z0-9 ,\-\/]/g, '').toUpperCase().replace(/'/g, "''")
  if (!safe) return res.json({ suggestions: [] })

  const params = new URLSearchParams({
    where: `UPPER(FORMATTEDADDRESS) LIKE '%${safe}%'`,
    outFields: 'FORMATTEDADDRESS',
    returnGeometry: 'false',
    returnCentroid: 'true',
    outSR: '4326',
    resultRecordCount: '8',
    orderByFields: 'FORMATTEDADDRESS',
    f: 'json',
  })

  try {
    const response = await fetch(`${AC_PROPERTY_URL}?${params}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'AucklandPropertyRiskChecker/1.0' },
    })
    if (!response.ok) return res.json({ suggestions: [] })
    const data = await response.json()
    if (data.error || !data.features?.length) return res.json({ suggestions: [] })

    const suggestions = data.features
      .filter(f => f.centroid)
      .map(f => ({
        address: f.attributes.FORMATTEDADDRESS,
        lat: f.centroid.y,
        lng: f.centroid.x,
      }))

    return res.json({ suggestions })
  } catch (err) {
    console.error('Suggest error:', err.message)
    return res.json({ suggestions: [] })
  }
})

// GET /api/hazards — ArcGIS query only, returns raw hazard list
const PARCELS_URL = AC_PROPERTY_URL

// Query LINZ parcels layer to snap geocoded point to the true parcel centroid.
// Falls back to the original geocoded point if no parcel is found.
async function getParcel(lat, lng) {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    outFields: 'OBJECTID_1',
    returnGeometry: 'true',
    f: 'json',
  })
  try {
    const response = await fetch(`${PARCELS_URL}?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'AucklandPropertyRiskChecker/1.0' },
    })
    if (!response.ok) return null
    const data = await response.json()
    if (data.error || !data.features?.length) return null

    const rings = data.features[0].geometry?.rings
    if (!rings?.length) return null

    // Compute centroid by averaging the exterior ring vertices
    const ring = rings[0]
    const sum = ring.reduce((acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }), { x: 0, y: 0 })
    return {
      lat: sum.y / ring.length,
      lng: sum.x / ring.length,
      geometry: toGeoJSON(data.features[0].geometry),
    }
  } catch (err) {
    console.warn('Parcel lookup failed:', err.message)
    return null
  }
}

app.get('/api/hazards', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng are required' })
  if (lat < -38 || lat > -35 || lng < 173 || lng > 176) {
    return res.status(400).json({ error: 'Location appears to be outside Auckland' })
  }

  try {
    const parcel = await getParcel(lat, lng)
    const queryLat = parcel ? parcel.lat : lat
    const queryLng = parcel ? parcel.lng : lng
    if (parcel) {
      console.log(`Snapped to parcel centroid: ${queryLat.toFixed(6)}, ${queryLng.toFixed(6)}`)
    } else {
      console.log(`No parcel found — using geocoded point: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    }

    const results = await Promise.all(HAZARD_LAYERS.map(l => queryArcGISLayer(l, queryLat, queryLng)))
    return res.json({
      hazards: results.filter(Boolean),
      parcelGeometry: parcel?.geometry ?? null,
      snappedToParcel: !!parcel,
    })
  } catch (err) {
    console.error('Hazard check error:', err)
    return res.status(500).json({ error: 'Failed to check hazard layers' })
  }
})

// ─── Scenario-aware Claude explanations ────────────────────────────────────
// User-facing labels for each scenario (never expose RCP names)
const SCENARIO_LABELS = {
  lower:   'Lower warming future',
  current: 'Current trajectory',
  high:    'High warming future',
}

async function generateExplanations(hazards, scenario = 'current', horizon = 'today') {
  if (!hazards.length) return []

  const scenarioLabel = SCENARIO_LABELS[scenario] || 'Current trajectory'
  const isFuture = horizon !== 'today'

  const hazardList = hazards
    .map((h, i) => {
      const attrsStr = Object.keys(h.attributes).length
        ? ` — council data: ${JSON.stringify(h.attributes)}`
        : ''
      return `${i + 1}. ${h.type}${attrsStr}`
    })
    .join('\n')

  // The prompt shifts focus depending on whether we're looking at today or a future horizon.
  const timeContext = isFuture
    ? `The homeowner wants to understand risk in ${horizon} under a "${scenarioLabel}" scenario.`
    : 'The homeowner wants to understand the current risk today.'

  const instructionFocus = isFuture
    ? `- Briefly note the current situation today
- Explain how this hazard is expected to change by ${horizon} under a "${scenarioLabel}" scenario
- Describe what drives the change in plain terms (e.g. heavier rainfall, higher sea levels) without using scientific jargon
- Mention what this means practically: damage likelihood, insurance pressure, or resilience considerations`
    : `- Describe what the hazard is in simple everyday terms
- Explain how it could affect the home or the people living there
- Mention practical implications: insurance costs, building requirements, or what happens during a severe weather event`

  const exampleTone = isFuture
    ? `Example tone: "Today, this property already has some flood risk during heavy rain. In future, heavier downpours are expected to make this kind of flooding more frequent. This increases the chance of water damage and may lead to higher insurance costs or stricter policy terms over time."`
    : `Example tone: "This property is in an area that could flood during very heavy rain. While flooding may not happen often, when it does, water could enter the house or damage access to the property. Homes in these areas often face higher insurance costs and may need extra precautions against water damage."`

  const prompt = `You are a friendly, knowledgeable property advisor helping everyday New Zealanders understand natural hazard risks.

${timeContext}

The following hazards have been identified at this Auckland property by Auckland Council's mapping data:

${hazardList}

For EACH hazard listed above, write a short plain-English explanation that:
${instructionFocus}
- Is calm, clear, and honest — helpful without being scary or alarmist
- Uses no GIS or technical climate jargon

${exampleTone}

Write 3–5 sentences per hazard. General public reading level.

Respond ONLY with a JSON array of strings — one explanation per hazard, in the same order as listed.
Example: ["Explanation for hazard 1.", "Explanation for hazard 2."]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].text.trim()
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const explanations = JSON.parse(text)
    return Array.isArray(explanations) ? explanations : []
  } catch (err) {
    console.error('Claude API error:', err.message)
    // Graceful fallback — app still works without AI explanations
    return hazards.map(h =>
      `This property is in a ${h.type} hazard zone according to Auckland Council data. Consider speaking with a property professional for more information.`
    )
  }
}

// POST /api/explain — Claude explanations, scenario + horizon aware
// Body: { hazards: [...], scenario: 'current'|'lower'|'high', horizon: 'today'|'2040'|'2090' }
app.post('/api/explain', async (req, res) => {
  const { hazards, scenario, horizon } = req.body
  if (!Array.isArray(hazards)) return res.status(400).json({ error: 'hazards array required' })

  try {
    const explanations = await generateExplanations(hazards, scenario, horizon)
    return res.json({ explanations })
  } catch (err) {
    console.error('Explain error:', err)
    return res.status(500).json({ error: 'Failed to generate explanations' })
  }
})

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Auckland Risk Checker backend running on http://localhost:${PORT}`)
})
