import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { AttributionControl, MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MarkerClusterGroup from './components/MarkerClusterGroup.jsx'
import './App.css'
import Header from './components/Header.jsx'
import EventList from './components/EventList.jsx'
import ActivityTicker from './components/ActivityFeed.jsx'
import PostLeftoversPanel from './components/PostLeftoversPanel.jsx'
import FlyerModal from './components/FlyerModal.jsx'
import FoodWheel from './components/FoodWheel.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import { ADMIN_MODE } from './config.js'
import { shareEvent } from './lib/share.js'
import { EventMarker, LeftoverMarker } from './components/FoodMarker.jsx'
import { eventMatches, isDietFilter, leftoverMatches } from './lib/filters.js'
import { withMapOffsets } from './lib/spread.js'
import { computeWeather } from './lib/weather.js'
import { buildFeed } from './lib/feed.js'
import { applyVisibility } from './lib/visibility.js'
import { useNow } from './hooks/useNow.js'
import { useMediaQuery } from './hooks/useMediaQuery.js'
import { useLiveData } from './hooks/useLiveData.js'
import { useTheme } from './hooks/useTheme.js'

// USE_MOCK, API_BASE and POLL_MS live in ./config.js; fetching and field
// mapping are in ./lib/api.js; polling is in ./hooks/useLiveData.js.

const UCSD_CENTER = [32.8801, -117.234]

// Shared links look like ?event=<id>: fly to that pin once data loads.
function deepLinkMarkerKey() {
  const id = new URLSearchParams(window.location.search).get('event')
  return id ? `event-${id}` : null
}

// Night mode uses these same tiles, darkened with a CSS filter (index.css).
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function hasCoords(x) {
  return x.lat != null && x.lng != null
}

export default function App() {
  const now = useNow(30000)
  const isDesktop = useMediaQuery('(min-width: 769px)')

  const [filter, setFilter] = useState('all')
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState('')
  const [initialDeepLink] = useState(deepLinkMarkerKey)
  const [focusKey, setFocusKey] = useState(initialDeepLink)
  const [showWheel, setShowWheel] = useState(false)
  const [shareFallback, setShareFallback] = useState(null)
  const [map, setMap] = useState(null)
  const [flyerEvent, setFlyerEvent] = useState(null)
  const [theme, toggleTheme] = useTheme()
  const closeFlyer = useCallback(() => setFlyerEvent(null), [])
  const closeWheel = useCallback(() => setShowWheel(false), [])
  const [showAdmin, setShowAdmin] = useState(false)
  const closeAdmin = useCallback(() => setShowAdmin(false), [])

  const {
    events: rawEvents,
    leftovers: rawLeftovers,
    setLeftovers,
    detectedAt,
    refresh,
  } = useLiveData({ onError: setToast })

  // On-campus + freshness rules, applied once: everything below (map, list,
  // wheel, feed, weather, counts) only ever sees what passes.
  const { events, leftovers, locationHidden } = useMemo(
    () => applyVisibility(rawEvents, rawLeftovers, now),
    [rawEvents, rawLeftovers, now],
  )

  const markers = useRef({})
  const sheetPeek = useRef(0)
  const pendingOpen = useRef(null)
  const clusterRef = useRef(null)
  const didFitBounds = useRef(false)

  const visibleEvents = events.filter(
    (ev) => ev.has_food && eventMatches(ev, filter, now),
  )
  const visibleLeftovers = leftovers.filter((lo) =>
    leftoverMatches(lo, filter, now),
  )
  // Events overlap a lot (4 at Geisel) and go into the cluster group.
  // Leftovers stay unclustered so their ring is always visible; the small
  // spread keeps two at the same building from hiding each other.
  const mapEvents = visibleEvents.filter(hasCoords)
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

  // Fly to a marker and open its popup once the map stops moving. Event pins
  // may still be inside a cluster then: zoomToShowLayer zooms in or
  // spiderfies until the pin itself is on screen.
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
        const cluster = clusterRef.current
        if (cluster?.hasLayer(marker)) {
          cluster.zoomToShowLayer(marker, () => marker.openPopup())
        } else {
          marker.openPopup()
        }
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

  // A pin that isn't on the map yet (just posted, hidden by a filter, or a
  // ?event= link waiting for the first poll) needs a render before its
  // marker exists.
  useEffect(() => {
    if (focusKey == null || !markers.current[focusKey]) return
    flyToMarker(focusKey)
    setFocusKey(null)
  }, [focusKey, flyToMarker, events, leftovers, filter])

  const handleShare = useCallback(async (ev) => {
    const result = await shareEvent(ev)
    if (result.status === 'copied') setToast('Link copied!')
    else if (result.status === 'manual') setShareFallback(result)
  }, [])

  function handlePickFromWheel(item) {
    setShowWheel(false)
    handleSelectFeed(item)
  }

  // First time there are pins: fit the map to them (unless a ?event= link
  // is about to fly somewhere). On phones, leave room for the bottom sheet.
  useEffect(() => {
    if (didFitBounds.current || !map) return
    const points = [...mapEvents, ...mapLeftovers].map((x) => [x.lat, x.lng])
    if (points.length === 0) return
    didFitBounds.current = true
    if (initialDeepLink) return
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40 + (isDesktop ? 0 : sheetPeek.current)],
      maxZoom: 17,
    })
  }, [map, mapEvents, mapLeftovers, isDesktop, initialDeepLink])

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
      onShare={handleShare}
      onPeekHeight={handlePeekHeight}
      hiddenCount={locationHidden}
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
        onOpenWheel={() => setShowWheel(true)}
        onOpenAdmin={ADMIN_MODE ? () => setShowAdmin(true) : undefined}
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
            <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />

            <MarkerClusterGroup ref={clusterRef}>
              {mapEvents.map((ev) => (
                <EventMarker
                  key={`event-${ev.id}`}
                  ref={registerMarker(`event-${ev.id}`)}
                  event={ev}
                  now={now}
                  onShowFlyer={setFlyerEvent}
                  onShare={handleShare}
                />
              ))}
            </MarkerClusterGroup>

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

        </div>
      </div>

      {flyerEvent && (
        <FlyerModal
          key={flyerEvent.id}
          event={flyerEvent}
          onClose={closeFlyer}
          onShare={handleShare}
        />
      )}

      {showAdmin && (
        // After a run, poll right away so new events show as "just detected".
        <AdminPanel onClose={closeAdmin} onFinished={refresh} />
      )}

      {showWheel && (
        <FoodWheel
          events={events}
          leftovers={activeLeftovers}
          now={now}
          onShowOnMap={handlePickFromWheel}
          onClose={closeWheel}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {shareFallback && (
        <div className="share-box" role="dialog" aria-label="Share link">
          <div className="share-box__top">
            <strong>Copy this link to share</strong>
            <button
              type="button"
              className="share-box__close"
              onClick={() => setShareFallback(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <input
            readOnly
            value={shareFallback.url}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
