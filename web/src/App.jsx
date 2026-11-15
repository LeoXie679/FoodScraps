import { useCallback, useEffect, useRef, useState } from 'react'
import { AttributionControl, MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import Header from './components/Header.jsx'
import EventList from './components/EventList.jsx'
import PostLeftoversPanel from './components/PostLeftoversPanel.jsx'
import { EventMarker, LeftoverMarker } from './components/FoodMarker.jsx'
import { USE_MOCK } from './config.js'
import { fetchLiveData, getInitialData } from './lib/api.js'
import { eventMatches, isDietFilter, leftoverMatches } from './lib/filters.js'
import { withMapOffsets } from './lib/spread.js'
import { useNow } from './hooks/useNow.js'
import { useMediaQuery } from './hooks/useMediaQuery.js'

// USE_MOCK and API_BASE live in ./config.js; data loading is in ./lib/api.js.

const UCSD_CENTER = [32.8801, -117.234]
const POLL_MS = 30000
const initialData = getInitialData()

export default function App() {
  const now = useNow(30000)
  const isDesktop = useMediaQuery('(min-width: 769px)')

  const [filter, setFilter] = useState('all')
  const [events, setEvents] = useState(initialData.events)
  const [leftovers, setLeftovers] = useState(initialData.leftovers)
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState('')
  const [focusKey, setFocusKey] = useState(null)
  const [map, setMap] = useState(null)

  const markers = useRef({})
  const sheetPeek = useRef(0)
  const pendingOpen = useRef(null)

  const visibleEvents = events.filter(
    (ev) => ev.has_food && eventMatches(ev, filter, now),
  )
  const visibleLeftovers = leftovers.filter((lo) =>
    leftoverMatches(lo, filter, now),
  )
  const mapEvents = withMapOffsets(visibleEvents)
  const mapLeftovers = withMapOffsets(visibleLeftovers)

  // Load live data and keep it fresh.
  useEffect(() => {
    if (USE_MOCK) return
    let cancelled = false
    async function load() {
      try {
        const data = await fetchLiveData()
        if (!cancelled) {
          setEvents(data.events)
          setLeftovers(data.leftovers)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setToast('Could not load live data — is the API running?')
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const registerMarker = (key) => (el) => {
    if (el) markers.current[key] = el
    else delete markers.current[key]
  }

  const handlePeekHeight = useCallback((h) => {
    sheetPeek.current = h
  }, [])

  // Fly to a marker and open its popup once the map stops moving.
  const flyToMarker = useCallback(
    (key) => {
      const marker = markers.current[key]
      if (!marker || !map) return
      const zoom = Math.max(map.getZoom(), 17)
      let target = marker.getLatLng()
      // On mobile, aim above the collapsed sheet so the pin isn't hidden.
      if (!isDesktop && sheetPeek.current) {
        const point = map.project(target, zoom).add([0, sheetPeek.current / 2])
        target = map.unproject(point, zoom)
      }
      if (pendingOpen.current) map.off('moveend', pendingOpen.current)
      const open = () => {
        pendingOpen.current = null
        marker.openPopup()
      }
      pendingOpen.current = open
      map.once('moveend', open)
      map.flyTo(target, zoom, { duration: 0.8 })
    },
    [map, isDesktop],
  )

  // A just-posted leftover needs one render before its marker exists.
  useEffect(() => {
    if (focusKey == null || !markers.current[focusKey]) return
    flyToMarker(focusKey)
    setFocusKey(null)
  }, [focusKey, flyToMarker, leftovers])

  // The map container changes size when switching sidebar <-> bottom sheet.
  useEffect(() => {
    map?.invalidateSize()
  }, [map, isDesktop])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function handlePosted(leftover) {
    setLeftovers((prev) => [...prev, leftover])
    setShowPanel(false)
    // Diet filters hide leftovers, so switch back to "all" so the new pin shows.
    if (isDietFilter(filter)) setFilter('all')
    setFocusKey(`leftover-${leftover.id}`)
    setToast('Posted! Students nearby can see it now')
  }

  const list = (
    <EventList
      mode={isDesktop ? 'sidebar' : 'sheet'}
      events={visibleEvents}
      leftovers={visibleLeftovers}
      now={now}
      onSelect={flyToMarker}
      onPeekHeight={handlePeekHeight}
    />
  )

  return (
    <div className="app">
      <Header
        filter={filter}
        onFilterChange={setFilter}
        onTogglePost={() => setShowPanel((s) => !s)}
      />

      <div className="app__body">
        {isDesktop && list}

        <div className="app__map">
          <MapContainer
            center={UCSD_CENTER}
            zoom={16}
            ref={setMap}
            attributionControl={false}
          >
            {/* Top-right so the mobile bottom sheet doesn't cover it. */}
            <AttributionControl position="topright" />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {mapEvents.map((ev) => (
              <EventMarker
                key={`event-${ev.id}`}
                ref={registerMarker(`event-${ev.id}`)}
                event={ev}
                now={now}
              />
            ))}

            {mapLeftovers.map((lo) => (
              <LeftoverMarker
                key={`leftover-${lo.id}`}
                ref={registerMarker(`leftover-${lo.id}`)}
                leftover={lo}
                now={now}
              />
            ))}
          </MapContainer>

          {!isDesktop && list}

          {showPanel && (
            <PostLeftoversPanel
              onPosted={handlePosted}
              onCancel={() => setShowPanel(false)}
            />
          )}

          {toast && (
            <div className="toast" role="status">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
