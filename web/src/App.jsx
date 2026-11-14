import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import mockData from './mock-events.json'

const USE_MOCK = true
const API_BASE = ''
// TODO: when USE_MOCK is false, fetch `${API_BASE}/events` and
// `${API_BASE}/leftovers/active` (GET) instead of using mock data.

const UCSD_CENTER = [32.8801, -117.234]
const FILTERS = ['all', 'now', 'today', 'vegetarian', 'halal']

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

export default function App() {
  const [filter, setFilter] = useState('all')
  const data = USE_MOCK ? mockData : { events: [], leftovers: [] }
  const now = new Date()

  const events = data.events.filter(
    (ev) => ev.has_food && eventMatches(ev, filter, now),
  )
  const leftovers = data.leftovers.filter((lo) =>
    leftoverMatches(lo, filter, now),
  )

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
      </header>

      <MapContainer center={UCSD_CENTER} zoom={16} style={styles.map}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {events.map((ev) => (
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
                  <img src={ev.image_url} alt={`${ev.title} flyer`} style={styles.flyer} />
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

        {leftovers.map((lo) => (
          <CircleMarker
            key={`leftover-${lo.id}`}
            center={[lo.lat, lo.lng]}
            radius={16}
            pathOptions={{ color: '#188038', fillColor: '#34a853', fillOpacity: 0.7 }}
          >
            <Popup>
              <div style={styles.popup}>
                <strong>Leftovers!</strong>
                <div>{lo.description}</div>
                <div>Posted by {lo.posted_by}</div>
                <div>Expires {formatTime(lo.expires_at)}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
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
  },
  map: { flex: 1, width: '100%' },
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
