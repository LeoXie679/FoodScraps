import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AttributionControl, MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import Header from './components/Header.jsx'
import EventList from './components/EventList.jsx'
import ActivityTicker from './components/ActivityFeed.jsx'
import PostLeftoversPanel from './components/PostLeftoversPanel.jsx'
import FlyerModal from './components/FlyerModal.jsx'
import { EventMarker, LeftoverMarker } from './components/FoodMarker.jsx'
import { eventMatches, isDietFilter, leftoverMatches } from './lib/filters.js'
import { withMapOffsets } from './lib/spread.js'
import { computeWeather } from './lib/weather.js'
import { buildFeed } from './lib/feed.js'
import { useNow } from './hooks/useNow.js'
import { useMediaQuery } from './hooks/useMediaQuery.js'
import { useLiveData } from './hooks/useLiveData.js'
import { useTheme } from './hooks/useTheme.js'

// USE_MOCK, API_BASE and POLL_MS live in ./config.js; fetching and field
// mapping are in ./lib/api.js; polling is in ./hooks/useLiveData.js.

const UCSD_CENTER = [32.8801, -117.234]

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    subdomains: 'abc',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    subdomains: 'abcd',
  },
}

export default function App() {
  const now = useNow(30000)
  const isDesktop = useMediaQuery('(min-width: 769px)')

  const [filter, setFilter] = useState('all')
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState('')
  const [focusKey, setFocusKey] = useState(null)
  const [map, setMap] = useState(null)
  const [flyerEvent, setFlyerEvent] = useState(null)
  const [theme, toggleTheme] = useTheme()
  const tiles = TILES[theme]
  const closeFlyer = useCallback(() => setFlyerEvent(null), [])

  const { events, leftovers, setLeftovers, detectedAt } = useLiveData({
    onError: setToast,
  })

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

  // Weather and feed look at all data, not just the active filter.
  const activeLeftovers = leftovers.filter((lo) => leftoverMatches(lo, 'all', now))
  const weather = computeWeather(events, activeLeftovers, now)
  const feed = useMemo(
    () => buildFeed(events, leftovers, detectedAt, now),
    [events, leftovers, detectedAt, now],
  )

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

  // Feed items can point at pins the current filter hides: switch to "all"
  // and fly once the pin has rendered.
  function handleSelectFeed(item) {
    if (!item.hasPin) return
    if (markers.current[item.markerKey]) {
      flyToMarker(item.markerKey)
    } else {
      setFilter('all')
      setFocusKey(item.markerKey)
    }
  }

  // A pin that isn't on the map yet (just posted, or hidden by a filter)
  // needs one render before its marker exists.
  useEffect(() => {
    if (focusKey == null || !markers.current[focusKey]) return
    flyToMarker(focusKey)
    setFocusKey(null)
  }, [focusKey, flyToMarker, leftovers, filter])

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
    // Replace rather than duplicate if a poll already brought it in.
    setLeftovers((prev) => [...prev.filter((l) => l.id !== leftover.id), leftover])
    setShowPanel(false)
    // Diet filters hide leftovers, so switch back to "all" so the new pin shows.
    if (isDietFilter(filter)) setFilter('all')
    if (leftover.lat != null && leftover.lng != null) {
      setFocusKey(`leftover-${leftover.id}`)
    }
    setToast('Posted! Students nearby can see it now')
  }

  const list = (
    <EventList
      mode={isDesktop ? 'sidebar' : 'sheet'}
      events={visibleEvents}
      leftovers={visibleLeftovers}
      feed={feed}
      now={now}
      onSelect={flyToMarker}
      onSelectFeed={handleSelectFeed}
      onShowFlyer={setFlyerEvent}
      onPeekHeight={handlePeekHeight}
    />
  )

  return (
    <div className="app">
      <Header
        filter={filter}
        onFilterChange={setFilter}
        onTogglePost={() => setShowPanel((s) => !s)}
        weather={weather}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <ActivityTicker items={feed} onSelect={handleSelectFeed} />

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
            {/* key={theme} remounts the layer so the attribution swaps too. */}
            <TileLayer
              key={theme}
              url={tiles.url}
              attribution={tiles.attribution}
              subdomains={tiles.subdomains}
            />

            {mapEvents.map((ev) => (
              <EventMarker
                key={`event-${ev.id}`}
                ref={registerMarker(`event-${ev.id}`)}
                event={ev}
                now={now}
                onShowFlyer={setFlyerEvent}
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

      {flyerEvent && (
        <FlyerModal key={flyerEvent.id} event={flyerEvent} onClose={closeFlyer} />
      )}
    </div>
  )
}
