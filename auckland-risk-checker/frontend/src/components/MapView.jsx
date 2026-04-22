import { MapContainer, TileLayer, Marker, Popup, GeoJSON, LayersControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import './PropertyMap.css'

// Fix default marker icon paths broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Colour per hazard type — used for both the map overlay and legend dot
const HAZARD_COLOURS = {
  'Flood Plains':                                        '#1d4ed8',
  'Flood Prone Areas':                                   '#3b82f6',
  'Flood Sensitive Areas':                               '#60a5fa',
  'Overland Flow Paths':                                 '#0369a1',
  'Coastal Inundation (1% AEP)':                        '#0891b2',
  'Coastal Inundation (1% AEP, 0.5m sea level rise)':  '#06b6d4',
  'Coastal Inundation (1% AEP, 1.0m sea level rise)':  '#0e7490',
  'Coastal Inundation (100yr return, 1.0m sea level rise)': '#155e75',
  'Coastal Inundation (High Water Levels)':             '#22d3ee',
  'Mean High Water Springs (0.5m sea level rise)':      '#67e8f9',
  'Mean High Water Springs (1.0m sea level rise)':      '#a5f3fc',
  'Coastal Erosion':                                    '#b45309',
  'Landslide Susceptibility':                           '#92400e',
  'Tsunami Evacuation Zones':                           '#7c3aed',
  default:                                              '#374151',
}

function hazardColour(type) {
  return HAZARD_COLOURS[type] || HAZARD_COLOURS.default
}

function HazardLayer({ hazard }) {
  const { geometry, type } = hazard
  if (!geometry) return null

  const colour = hazardColour(type)

  const style = useMemo(() => ({
    color:       colour,
    weight:      geometry.type === 'MultiLineString' ? 2.5 : 1.5,
    opacity:     0.85,
    fillColor:   colour,
    fillOpacity: geometry.type === 'MultiLineString' ? 0 : 0.25,
  }), [colour, geometry.type])

  const onEachFeature = (_, layer) => {
    layer.bindTooltip(type, { sticky: true, className: 'hazard-tooltip' })
  }

  // GeoJSON key forces remount when geometry changes (e.g. new address search)
  return (
    <GeoJSON
      key={`${type}-${JSON.stringify(geometry).slice(0, 40)}`}
      data={geometry}
      style={style}
      onEachFeature={onEachFeature}
    />
  )
}

// Re-centers map when lat/lng changes without remounting
function MapUpdater({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 16)
  }, [lat, lng, map])
  return null
}

export default function MapView({ lat, lng, hazards = [], parcelGeometry = null, snappedToParcel = false }) {
  const hazardsWithGeometry = hazards.filter(h => h.geometry)

  const parcelStyle = {
    color: '#f59e0b',
    weight: 2.5,
    opacity: 1,
    fillColor: '#f59e0b',
    fillOpacity: 0.06,
    dashArray: '6 4',
  }

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: '400px', width: '100%' }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Street">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          {hazardsWithGeometry.map(h => (
            <LayersControl.Overlay checked name={h.type} key={h.type}>
              <HazardLayer hazard={h} />
            </LayersControl.Overlay>
          ))}
        </LayersControl>

        {parcelGeometry && (
          <GeoJSON
            key={JSON.stringify(parcelGeometry).slice(0, 40)}
            data={parcelGeometry}
            style={parcelStyle}
          />
        )}

        <Marker position={[lat, lng]}>
          <Popup>{snappedToParcel ? 'Snapped to parcel centroid' : 'Geocoded location'}</Popup>
        </Marker>

        <MapUpdater lat={lat} lng={lng} />
      </MapContainer>

      {snappedToParcel && (
        <div className="map-parcel-badge">
          <span className="map-parcel-dot" />
          Assessed from parcel centroid
        </div>
      )}

      {hazardsWithGeometry.length > 0 && (
        <div className="map-legend">
          {hazardsWithGeometry.map(h => (
            <div key={h.type} className="map-legend-item">
              <span
                className="map-legend-dot"
                style={{ background: hazardColour(h.type) }}
              />
              <span className="map-legend-label">{h.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
