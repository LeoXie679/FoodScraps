import { USE_MOCK, API_BASE } from '../config.js'
import mockData from '../mock-events.json'

const LEFTOVER_TTL_MS = 2 * 60 * 60 * 1000

// Live data starts empty and is filled in by fetchLiveData().
export function getInitialData() {
  if (USE_MOCK) return mockData
  return { events: [], leftovers: [] }
}

// API_BASE may be '' (same-origin behind Caddy) — that is valid.
export async function fetchLiveData() {
  const [evRes, loRes] = await Promise.all([
    fetch(`${API_BASE}/events`),
    fetch(`${API_BASE}/leftovers/active`),
  ])
  if (!evRes.ok || !loRes.ok) throw new Error('API fetch failed')
  const [events, leftovers] = await Promise.all([evRes.json(), loRes.json()])
  return { events, leftovers }
}

export async function createLeftover({ building, description, postedBy }) {
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
