import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Navigation, Table2, Activity, AlertCircle, Loader2, ChevronDown, ChevronUp, Truck, Plus, Trash2, RotateCcw, Languages } from 'lucide-react'
import { fetchRoute, fetchMatrix, fetchTrip, checkHealth } from './api'
import SearchBox from './SearchBox'
import { useI18n } from './i18n'

const VIETNAM_CENTER = [16.0, 106.0]
const VIETNAM_ZOOM = 6

const originIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})
const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})

function MapClickHandler({ onOriginSet, onDestSet, pickMode }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      if (pickMode === 'origin') onOriginSet(lat, lng)
      else if (pickMode === 'dest') onDestSet(lat, lng)
    },
  })
  return null
}

function MapController({ flyTo }) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo(flyTo, 13, { duration: 1.2 })
  }, [flyTo, map])
  return null
}

function StatusBadge({ health, t }) {
  if (health === null) return <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" />{t('checking')}</span>
  if (health === 'ok') return <span className="text-xs text-emerald-400 flex items-center gap-1"><Activity size={12} />{t('apiOnline')}</span>
  return <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{t('apiOffline')}</span>
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function formatDuration(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const PRESETS = [
  { label: 'Hà Nội → TP.HCM', o: [21.0285, 105.8542], d: [10.8231, 106.6297] },
  { label: 'Hà Nội → Đà Nẵng', o: [21.0285, 105.8542], d: [16.0544, 108.2022] },
  { label: 'Đà Nẵng → TP.HCM', o: [16.0544, 108.2022], d: [10.8231, 106.6297] },
  { label: 'TP.HCM → Nha Trang', o: [10.8231, 106.6297], d: [12.2388, 109.1967] },
]

export default function App() {
  const { lang, switchLang, t } = useI18n()
  const [tab, setTab] = useState('route')
  const [health, setHealth] = useState(null)

  const [originLat, setOriginLat] = useState('21.0285')
  const [originLng, setOriginLng] = useState('105.8542')
  const [destLat, setDestLat] = useState('10.8231')
  const [destLng, setDestLng] = useState('106.6297')
  const [pickMode, setPickMode] = useState(null)
  const [flyTo, setFlyTo] = useState(null)

  const [routeResult, setRouteResult] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)

  const [matrixOrigins, setMatrixOrigins] = useState('21.0285,105.8542\n16.0544,108.2022')
  const [matrixDests, setMatrixDests] = useState('10.8231,106.6297\n12.2388,109.1967')
  const [matrixResult, setMatrixResult] = useState(null)
  const [matrixError, setMatrixError] = useState(null)
  const [matrixLoading, setMatrixLoading] = useState(false)

  useEffect(() => {
    checkHealth()
      .then(d => setHealth(d.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setHealth('error'))
  }, [])

  const [showSteps, setShowSteps] = useState(false)

  // Trip state
  const [tripStops, setTripStops] = useState('21.0285,105.8542\n16.0544,108.2022\n10.8231,106.6297')
  const [tripRoundtrip, setTripRoundtrip] = useState(false)
  const [tripResult, setTripResult] = useState(null)
  const [tripError, setTripError] = useState(null)
  const [tripLoading, setTripLoading] = useState(false)

  // Use real geometry from OSRM if available, else fallback straight line
  const activeGeometry = (() => {
    if (tab === 'trip' && tripResult?.geometry?.length > 1) return tripResult.geometry
    if (tab === 'route' && routeResult?.geometry?.length > 1) return routeResult.geometry
    if (tab === 'route' && routeResult) return [[parseFloat(originLat), parseFloat(originLng)], [parseFloat(destLat), parseFloat(destLng)]]
    return null
  })()

  // Trip markers
  const tripMarkers = (() => {
    if (tab !== 'trip' || !tripResult) return []
    const stops = tripStops.trim().split('\n').map(l => l.split(',').map(Number))
    return tripResult.waypointOrder.map((idx, i) => ({ pos: stops[idx], order: i + 1, idx }))
  })()

  async function handleRoute(e) {
    e.preventDefault()
    setRouteError(null)
    setRouteResult(null)
    setShowSteps(false)
    setRouteLoading(true)
    try {
      const data = await fetchRoute(parseFloat(originLat), parseFloat(originLng), parseFloat(destLat), parseFloat(destLng))
      setRouteResult(data)
    } catch (err) {
      setRouteError(err.message)
    } finally {
      setRouteLoading(false)
    }
  }

  async function handleTrip(e) {
    e.preventDefault()
    setTripError(null)
    setTripResult(null)
    setTripLoading(true)
    try {
      const waypoints = tripStops.trim().split('\n').map(line => {
        const [lat, lng] = line.split(',').map(Number)
        return [lat, lng]
      })
      const data = await fetchTrip(waypoints, tripRoundtrip)
      setTripResult(data)
    } catch (err) {
      setTripError(err.message)
    } finally {
      setTripLoading(false)
    }
  }

  async function handleMatrix(e) {
    e.preventDefault()
    setMatrixError(null)
    setMatrixResult(null)
    setMatrixLoading(true)
    try {
      const parseCoords = (text) =>
        text.trim().split('\n').map(line => {
          const [lat, lng] = line.split(',').map(Number)
          return [lat, lng]
        })
      const origins = parseCoords(matrixOrigins)
      const destinations = parseCoords(matrixDests)
      const data = await fetchMatrix(origins, destinations)
      setMatrixResult({ data, origins, destinations })
    } catch (err) {
      setMatrixError(err.message)
    } finally {
      setMatrixLoading(false)
    }
  }

  function applyPreset(p) {
    setOriginLat(String(p.o[0]))
    setOriginLng(String(p.o[1]))
    setDestLat(String(p.d[0]))
    setDestLng(String(p.d[1]))
    setRouteResult(null)
    setRouteError(null)
    setFlyTo(null)
  }

  function handleOriginSelect(lat, lng) {
    setOriginLat(String(lat.toFixed(6)))
    setOriginLng(String(lng.toFixed(6)))
    setRouteResult(null)
    setFlyTo([lat, lng])
  }

  function handleDestSelect(lat, lng) {
    setDestLat(String(lat.toFixed(6)))
    setDestLng(String(lng.toFixed(6)))
    setRouteResult(null)
    setFlyTo([lat, lng])
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Navigation size={22} className="text-blue-400" />
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">{t('appTitle')}</h1>
            <p className="text-xs text-gray-400">{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => switchLang(lang === 'vi' ? 'en' : 'vi')}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors border border-gray-700"
            title="Switch language"
          >
            <Languages size={13} />
            <span className="font-medium">{lang === 'vi' ? 'EN' : 'VI'}</span>
          </button>
          <StatusBadge health={health} t={t} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
        {/* Sidebar */}
        <aside className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button onClick={() => setTab('route')}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'route' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50' : 'text-gray-400 hover:text-gray-200'}`}>
              <Navigation size={13} />{t('tabRoute')}
            </button>
            <button onClick={() => setTab('trip')}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'trip' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50' : 'text-gray-400 hover:text-gray-200'}`}>
              <Truck size={13} />{t('tabDelivery')}
            </button>
            <button onClick={() => setTab('matrix')}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'matrix' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50' : 'text-gray-400 hover:text-gray-200'}`}>
              <Table2 size={13} />{t('tabMatrix')}
            </button>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-4">
            {tab === 'route' && (
              <>
                {/* Presets */}
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">{t('presetRoutes')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1.5 rounded transition-colors text-left truncate"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Map pick mode */}
                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">{t('clickMapToPick')}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPickMode(pickMode === 'origin' ? null : 'origin')}
                      className={`flex-1 text-xs py-2 rounded flex items-center justify-center gap-1.5 transition-colors ${pickMode === 'origin' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    >
                      <MapPin size={13} />{t('pickOrigin')}
                    </button>
                    <button
                      onClick={() => setPickMode(pickMode === 'dest' ? null : 'dest')}
                      className={`flex-1 text-xs py-2 rounded flex items-center justify-center gap-1.5 transition-colors ${pickMode === 'dest' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    >
                      <MapPin size={13} />{t('pickDest')}
                    </button>
                  </div>
                  {pickMode && (
                    <p className="text-xs text-yellow-400 mt-1.5">
                      {pickMode === 'origin' ? t('clickMapOrigin') : t('clickMapDest')}
                    </p>
                  )}
                </div>

                {/* Form */}
                <form onSubmit={handleRoute} className="flex flex-col gap-3">
                  <div className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2">
                    <SearchBox label={t('origin')} color="green" onSelect={handleOriginSelect} />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-xs text-gray-500">{t('latitude')}</label>
                        <input type="number" step="any" value={originLat} onChange={e => setOriginLat(e.target.value)}
                          className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('longitude')}</label>
                        <input type="number" step="any" value={originLng} onChange={e => setOriginLng(e.target.value)}
                          className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2">
                    <SearchBox label={t('destination')} color="red" onSelect={handleDestSelect} />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-xs text-gray-500">{t('latitude')}</label>
                        <input type="number" step="any" value={destLat} onChange={e => setDestLat(e.target.value)}
                          className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-red-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('longitude')}</label>
                        <input type="number" step="any" value={destLng} onChange={e => setDestLng(e.target.value)}
                          className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 mt-0.5 outline-none focus:ring-1 focus:ring-red-500" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={routeLoading}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    {routeLoading ? <><Loader2 size={15} className="animate-spin" />{t('calculating')}</> : <><Navigation size={15} />{t('getRoute')}</>}
                  </button>
                </form>

                {/* Route result */}
                {routeError && (
                  <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300">{routeError}</p>
                  </div>
                )}
                {routeResult && (
                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4 flex flex-col gap-3">
                    <p className="text-xs text-blue-400 uppercase tracking-wider">{t('routeResult')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-white">{formatDistance(routeResult.distanceMeters)}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('distance')}</p>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-white">{formatDuration(routeResult.durationSeconds)}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('duration')}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      {t('avgSpeed')}: {((routeResult.distanceMeters / routeResult.durationSeconds) * 3.6).toFixed(0)} km/h
                      {routeResult.geometry?.length > 0 && <span className="ml-2 text-emerald-500">· {t('realRoad')}</span>}
                    </p>
                    {routeResult.steps?.length > 0 && (
                      <div>
                        <button onClick={() => setShowSteps(v => !v)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors w-full">
                          {showSteps ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                          {t('directions')} ({routeResult.steps.length} {t('steps')})
                        </button>
                        {showSteps && (
                          <ul className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {routeResult.steps.filter(s => s.type !== 'arrive' || s.instruction).map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs py-1 border-b border-gray-700/40 last:border-0">
                                <span className="text-gray-500 w-5 shrink-0 text-right">{i + 1}.</span>
                                <span className="text-gray-300">
                                  <span className="text-yellow-400 capitalize">{s.type}{s.modifier ? ` ${s.modifier}` : ''}</span>
                                  {s.instruction ? ` · ${s.instruction}` : ''}
                                  <span className="text-gray-500 ml-1">({formatDistance(s.distanceMeters)})</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'trip' && (
              <>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {t('tripDescription')} <span className="text-yellow-400 font-medium">{t('tripDescriptionBold')}</span> {t('tripDescriptionSuffix')}
                  </p>
                </div>
                <form onSubmit={handleTrip} className="flex flex-col gap-3">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-emerald-400 font-medium">{t('stops')} <span className="text-gray-500">{t('stopsHint')}</span></p>
                    </div>
                    <textarea
                      value={tripStops}
                      onChange={e => setTripStops(e.target.value)}
                      rows={6}
                      placeholder="21.0285,105.8542&#10;16.0544,108.2022&#10;10.8231,106.6297"
                      className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                    <input type="checkbox" checked={tripRoundtrip} onChange={e => setTripRoundtrip(e.target.checked)}
                      className="accent-blue-500" />
                    <RotateCcw size={12} className="text-gray-400" />
                    {t('returnToStart')}
                  </label>
                  <button type="submit" disabled={tripLoading}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    {tripLoading ? <><Loader2 size={15} className="animate-spin" />{t('optimizing')}</> : <><Truck size={15} />{t('optimizeRoute')}</>}
                  </button>
                </form>

                {tripError && (
                  <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300">{tripError}</p>
                  </div>
                )}
                {tripResult && (
                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4 flex flex-col gap-3">
                    <p className="text-xs text-blue-400 uppercase tracking-wider">{t('optimizedResult')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-white">{formatDistance(tripResult.distanceMeters)}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('totalDistance')}</p>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-white">{formatDuration(tripResult.durationSeconds)}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('totalDuration')}</p>
                      </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-3">
                      <p className="text-xs text-yellow-400 font-medium mb-2">{t('optimizedOrder')}</p>
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const stops = tripStops.trim().split('\n').map(l => l.split(',').map(Number))
                          return tripResult.waypointOrder.map((origIdx, visitOrder) => (
                            <div key={visitOrder} className="flex items-center gap-2 text-xs">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{visitOrder + 1}</span>
                              <span className="text-gray-300 font-mono">{stops[origIdx]?.[0]?.toFixed(4)}, {stops[origIdx]?.[1]?.toFixed(4)}</span>
                              {visitOrder === 0 && <span className="text-emerald-400 text-[10px]">{t('depot')}</span>}
                            </div>
                          ))
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {tripResult.legs.map((leg, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-gray-800/40 rounded px-2 py-1.5">
                          <span className="text-gray-400">{t('leg')} {i + 1}</span>
                          <span className="text-white">{formatDistance(leg.distanceMeters)}</span>
                          <span className="text-gray-400">{formatDuration(leg.durationSeconds)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'matrix' && (
              <>
                <form onSubmit={handleMatrix} className="flex flex-col gap-3">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-emerald-400 font-medium mb-2">{t('origins')} <span className="text-gray-500">{t('perLine')}</span></p>
                    <textarea
                      value={matrixOrigins}
                      onChange={e => setMatrixOrigins(e.target.value)}
                      rows={4}
                      placeholder="21.0285,105.8542&#10;16.0544,108.2022"
                      className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
                    />
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-red-400 font-medium mb-2">{t('destinations')} <span className="text-gray-500">{t('perLine')}</span></p>
                    <textarea
                      value={matrixDests}
                      onChange={e => setMatrixDests(e.target.value)}
                      rows={4}
                      placeholder="10.8231,106.6297&#10;12.2388,109.1967"
                      className="w-full bg-gray-700 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-none"
                    />
                  </div>
                  <button type="submit" disabled={matrixLoading}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    {matrixLoading ? <><Loader2 size={15} className="animate-spin" />{t('computing')}</> : <><Table2 size={15} />{t('computeMatrix')}</>}
                  </button>
                </form>

                {matrixError && (
                  <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300">{matrixError}</p>
                  </div>
                )}
                {matrixResult && (
                  <div className="bg-gray-800/60 rounded-lg p-3">
                    <p className="text-xs text-blue-400 uppercase tracking-wider mb-3">{t('distanceMatrixKm')}</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr>
                            <th className="text-gray-500 text-left pr-2 pb-1">O\D</th>
                            {matrixResult.data.distances[0].map((_, di) => (
                              <th key={di} className="text-red-400 pb-1 px-2">D{di + 1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixResult.data.distances.map((row, oi) => (
                            <tr key={oi}>
                              <td className="text-emerald-400 pr-2 py-1">O{oi + 1}</td>
                              {row.map((d, di) => (
                                <td key={di} className="text-white px-2 py-1 text-center font-mono">
                                  {(d / 1000).toFixed(0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-blue-400 uppercase tracking-wider mt-3 mb-3">{t('durationMatrixMin')}</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr>
                            <th className="text-gray-500 text-left pr-2 pb-1">O\D</th>
                            {matrixResult.data.durations[0].map((_, di) => (
                              <th key={di} className="text-red-400 pb-1 px-2">D{di + 1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixResult.data.durations.map((row, oi) => (
                            <tr key={oi}>
                              <td className="text-emerald-400 pr-2 py-1">O{oi + 1}</td>
                              {row.map((d, di) => (
                                <td key={di} className="text-white px-2 py-1 text-center font-mono">
                                  {Math.round(d / 60)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          {pickMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/95 border border-yellow-500/50 rounded-full px-4 py-1.5 text-xs text-yellow-300 pointer-events-none shadow-lg">
              {pickMode === 'origin' ? t('clickMapOrigin') : t('clickMapDest')}
            </div>
          )}
          <MapContainer
            center={VIETNAM_CENTER}
            zoom={VIETNAM_ZOOM}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler
              onOriginSet={(lat, lng) => { setOriginLat(String(lat.toFixed(6))); setOriginLng(String(lng.toFixed(6))); setPickMode(null) }}
              onDestSet={(lat, lng) => { setDestLat(String(lat.toFixed(6))); setDestLng(String(lng.toFixed(6))); setPickMode(null) }}
              pickMode={pickMode}
            />
            <MapController flyTo={flyTo} />
            {tab === 'route' && originLat && originLng && (
              <Marker position={[parseFloat(originLat), parseFloat(originLng)]} icon={originIcon} />
            )}
            {tab === 'route' && destLat && destLng && (
              <Marker position={[parseFloat(destLat), parseFloat(destLng)]} icon={destIcon} />
            )}
            {tab === 'trip' && tripMarkers.map(m => (
              <Marker key={m.idx} position={m.pos}
                icon={new L.DivIcon({
                  html: `<div style="background:#2563eb;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;border:2px solid #93c5fd;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${m.order}</div>`,
                  className: '', iconSize: [24, 24], iconAnchor: [12, 12],
                })}
              />
            ))}
            {activeGeometry && activeGeometry.length > 1 && (
              <Polyline positions={activeGeometry} color="#3b82f6" weight={4} opacity={0.85} />
            )}
          </MapContainer>
        </main>
      </div>
    </div>
  )
}
