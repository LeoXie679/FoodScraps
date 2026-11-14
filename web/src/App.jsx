import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import mockData from './mock-events.json'
import buildingsData from './buildings.json'

const USE_MOCK = true
const API_BASE = ''
// TODO: when USE_MOCK is false, fetch `${API_BASE}/events` and
// `${API_BASE}/leftovers/active` (GET) instead of using mock data.

const UCSD_CENTER = [32.8801, -117.234]
const FILTERS = ['all', 'now', 'today', 'vegetarian', 'halal']
const BUILDINGS = buildingsData.buildings
const LEFTOVER_TTL_MS = 2 * 60 * 60 * 1000

const timeFmt = { hour: 'numeric', minute: '2-digit' }
const dateFmt = { weekday: 'short', month: 'short', day: 'numeric' }

function formatTimeRange(start, end) {
  const s = new Date(start)
  const e = new Date(end)
  return `${s.toLocaleDateString(undefined, dateFmt)}, ${s.toLocaleTimeString(undefined, timeFmt)} – ${e.toLocaleTimeString(undefined, timeFmt)}`
}

function formatTime(t) {
  const d = new Date(t)
  return `${d.toLocaleDateString(undefined, dateFmt)}, ${d.toLocaleTimeString(undefined, timeFmt)}`
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function eventMatches(ev, filter, now) {
  const start = new Date(ev.start_time)
  const end = new Date(ev.end_time)
  switch (filter) {
    case 'now':
      return start <= now && now <= end
    case 'today':
      return isSameDay(start, now) && end >= now
    case 'vegetarian':
    case 'halal':
      return (ev.dietary || []).includes(filter)
    default:
      return true
  }
}

// Leftovers have no dietary info, so they're hidden under the diet filters.
function leftoverMatches(lo, filter, now) {
  if (filter === 'vegetarian' || filter === 'halal') return false
  return new Date(lo.expires_at) >= now
}

async function createLeftover({ building, description, postedBy }) {
  if (USE_MOCK) {
    const now = new Date()
    return {
      id: Date.now(),
      location_name: building.name,
      lat: building.lat,
      lng: building.lng,
      description,
      posted_by: postedBy,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + LEFTOVER_TTL_MS).toISOString(),
    }
  }
  const res = await fetch(`${API_BASE}/leftovers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location_name: building.name,
      description,
      posted_by: postedBy,
    }),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const saved = await res.json()
  // Fall back to our own building coords if the server doesn't send them back.
  return { lat: building.lat, lng: building.lng, ...saved }
}

function PostLeftoversPanel({ onPosted, onCancel }) {
  const [buildingName, setBuildingName] = useState(BUILDINGS[0].name)
  const [description, setDescription] = useState('')
  const [postedBy, setPostedBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) {
      setError('Please describe the food.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const building = BUILDINGS.find((b) => b.name === buildingName)
      const leftover = await createLeftover({
        building,
        description: description.trim(),
        postedBy: postedBy.trim(),
      })
      onPosted(leftover)
    } catch (err) {
      setError(`Couldn't post: ${err.message}`)
      setSubmitting(false)
    }
  }

  return (
    <form style={styles.panel} onSubmit={handleSubmit}>
      <strong style={{ fontSize: '1.05rem' }}>Post leftovers</strong>

      <label style={styles.label}>
        Building
        <select
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          style={styles.input}
        >
          {BUILDINGS.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.aliases?.length ? ` (${b.aliases[0]})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label style={styles.label}>
        What food and how much?
        <textarea
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 4 boxes of cheese pizza"
          style={{ ...styles.input, resize: 'vertical' }}
        />
      </label>

      <label style={styles.label}>
        Posted by (club name)
        <input
          type="text"
          value={postedBy}
          onChange={(e) => setPostedBy(e.target.value)}
          style={styles.input}
        />
      </label>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.panelButtons}>
        <button type="button" onClick={onCancel} style={styles.button}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          style={{ ...styles.button, ...styles.greenButton }}
        >
          {submitting ? 'Posting…' : 'Submit'}
        </button>
      </div>
    </form>
  )
}

export default function App() {
  const [filter, setFilter] = useState('all')
  const [leftovers, setLeftovers] = useState(
    USE_MOCK ? mockData.leftovers : [],
  )
  const [showPanel, setShowPanel] = useState(false)
  const [toast, setToast] = useState('')
  const [focusId, setFocusId] = useState(null)
  const [map, setMap] = useState(null)
  const markerRefs = useRef({})

  const events = USE_MOCK ? mockData.events : []
  const now = new Date()

  const visibleEvents = events.filter(
    (ev) => ev.has_food && eventMatches(ev, filter, now),
  )
  const visibleLeftovers = leftovers.filter((lo) =>
    leftoverMatches(lo, filter, now),
  )

  // After a new leftover renders, fly to it and open its popup.
  useEffect(() => {
    if (focusId == null || !map) return
    const marker = markerRefs.current[focusId]
    if (!marker) return
    map.once('moveend', () => marker.openPopup())
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 17), {
      duration: 0.8,
    })
    setFocusId(null)
  }, [focusId, map, leftovers])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function handlePosted(leftover) {
    setLeftovers((prev) => [...prev, leftover])
    setShowPanel(false)
    // Diet filters hide leftovers, so switch back to "all" so the new pin shows.
    if (filter === 'vegetarian' || filter === 'halal') setFilter('all')
    setFocusId(leftover.id)
    setToast('Posted! Students nearby can see it now')
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Free Food Radar</h1>
        <nav style={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...styles.button,
                fontWeight: filter === f ? 700 : 400,
                background: filter === f ? '#e8f0fe' : '#fff',
                borderColor: filter === f ? '#1a73e8' : '#ccc',
              }}
            >
              {f}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setShowPanel((s) => !s)}
          style={{ ...styles.button, ...styles.greenButton, marginLeft: 'auto' }}
        >
          Post leftovers
        </button>
      </header>

      <div style={styles.mapWrap}>
        <MapContainer
          center={UCSD_CENTER}
          zoom={16}
          style={styles.map}
          ref={setMap}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {visibleEvents.map((ev) => (
            <CircleMarker
              key={`event-${ev.id}`}
              center={[ev.lat, ev.lng]}
              radius={10}
              pathOptions={{
                color: '#1a73e8',
                fillColor: '#1a73e8',
                fillOpacity: 0.25 + 0.6 * (ev.confidence ?? 0),
              }}
            >
              <Popup>
                <div style={styles.popup}>
                  <strong>{ev.title}</strong>
                  <div>{ev.org}</div>
                  <div>{ev.location_name}</div>
                  <div>{formatTimeRange(ev.start_time, ev.end_time)}</div>
                  <div>🍕 {ev.food_desc}</div>
                  {ev.dietary?.length > 0 && (
                    <div style={styles.tags}>
                      {ev.dietary.map((d) => (
                        <span key={d} style={styles.tag}>
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                  {ev.image_url && (
                    <img
                      src={ev.image_url}
                      alt={`${ev.title} flyer`}
                      style={styles.flyer}
                    />
                  )}
                  {ev.source_url && (
                    <a href={ev.source_url} target="_blank" rel="noreferrer">
                      source
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {visibleLeftovers.map((lo) => (
            <CircleMarker
              key={`leftover-${lo.id}`}
              ref={(el) => {
                if (el) markerRefs.current[lo.id] = el
                else delete markerRefs.current[lo.id]
              }}
              center={[lo.lat, lo.lng]}
              radius={16}
              pathOptions={{
                color: '#188038',
                fillColor: '#34a853',
                fillOpacity: 0.7,
              }}
            >
              <Popup>
                <div style={styles.popup}>
                  <strong>Leftovers!</strong>
                  {lo.location_name && <div>{lo.location_name}</div>}
                  <div>{lo.description}</div>
                  {lo.posted_by && <div>Posted by {lo.posted_by}</div>}
                  <div>Expires {formatTime(lo.expires_at)}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {showPanel && (
          <PostLeftoversPanel
            onPosted={handlePosted}
            onCancel={() => setShowPanel(false)}
          />
        )}

        {toast && (
          <div style={styles.toast} role="status">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  app: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px 16px',
    padding: '8px 12px',
    borderBottom: '1px solid #ddd',
    background: '#fff',
    zIndex: 1000,
  },
  title: { margin: 0, fontSize: '1.2rem', whiteSpace: 'nowrap' },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  button: {
    padding: '6px 12px',
    minHeight: 32,
    border: '1px solid #ccc',
    borderRadius: 16,
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    background: '#fff',
  },
  greenButton: {
    background: '#188038',
    borderColor: '#188038',
    color: '#fff',
    fontWeight: 600,
  },
  mapWrap: { position: 'relative', flex: 1, minHeight: 0 },
  map: { height: '100%', width: '100%' },
  panel: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 'min(340px, calc(100% - 24px))',
    maxHeight: 'calc(100% - 24px)',
    overflowY: 'auto',
    zIndex: 1100,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: '0.9rem',
  },
  input: {
    padding: 8,
    border: '1px solid #ccc',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: 16, // 16px stops iOS Safari from zooming in on focus
  },
  panelButtons: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  error: { color: '#c5221f', fontSize: '0.85rem' },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1100,
    background: '#188038',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    fontSize: '0.95rem',
    maxWidth: 'calc(100% - 24px)',
    textAlign: 'center',
  },
  popup: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 200 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tag: {
    background: '#e6f4ea',
    color: '#137333',
    borderRadius: 8,
    padding: '1px 6px',
    fontSize: '0.8em',
  },
  flyer: { width: 160, maxWidth: '100%', borderRadius: 4 },
}
