import { USE_MOCK, API_BASE } from '../config.js'
import mockData from '../mock-events.json'

const LEFTOVER_TTL_MS = 2 * 60 * 60 * 1000
const DEFAULT_CONFIDENCE = 0.7

// ---- Normalizing API data into the shape the components use ----

function toNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toText(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function toTime(v) {
  const s = toText(v)
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null
}

/**
 * Event shape used by the UI. Missing fields become null (or [] for dietary);
 * no confidence → 0.7; no lat/lng → listed but no pin; no image → no flyer.
 */
export function normalizeEvent(raw) {
  const confidence = toNumber(raw.confidence)
  return {
    id: raw.id,
    title: toText(raw.title) ?? 'Untitled event',
    org: toText(raw.org),
    start_time: toTime(raw.start_time),
    end_time: toTime(raw.end_time),
    location_name: toText(raw.location_name),
    lat: toNumber(raw.lat),
    lng: toNumber(raw.lng),
    has_food: raw.has_food !== false,
    food_desc: toText(raw.food_desc),
    dietary: Array.isArray(raw.dietary)
      ? raw.dietary.map((d) => String(d).toLowerCase())
      : [],
    confidence:
      confidence == null ? DEFAULT_CONFIDENCE : Math.min(1, Math.max(0, confidence)),
    source_url: toText(raw.source_url),
    image_url: toText(raw.image_url),
    // Not sent by the API yet; the live feed uses it if the backend adds it.
    created_at: toTime(raw.created_at),
    // Which fallbacks above were used, so the flyer panel can be honest.
    found: {
      title: toText(raw.title) != null,
      confidence: confidence != null,
    },
  }
}

export function normalizeLeftover(raw) {
  return {
    id: raw.id,
    location_name: toText(raw.location_name),
    lat: toNumber(raw.lat),
    lng: toNumber(raw.lng),
    description: toText(raw.description) ?? 'Leftover food',
    posted_by: toText(raw.posted_by),
    created_at: toTime(raw.created_at),
    expires_at: toTime(raw.expires_at),
  }
}

function normalizeList(data, fn) {
  return Array.isArray(data) ? data.filter((x) => x && x.id != null).map(fn) : []
}

// ---- Loading ----

export function getInitialData() {
  if (USE_MOCK) {
    return {
      events: normalizeList(mockData.events, normalizeEvent),
      leftovers: normalizeList(mockData.leftovers, normalizeLeftover),
    }
  }
  return { events: [], leftovers: [] }
}

export async function fetchLiveData() {
  const [evRes, loRes] = await Promise.all([
    fetch(`${API_BASE}/events`),
    fetch(`${API_BASE}/leftovers/active`),
  ])
  if (!evRes.ok || !loRes.ok) throw new Error('API fetch failed')
  const [events, leftovers] = await Promise.all([evRes.json(), loRes.json()])
  return {
    events: normalizeList(events, normalizeEvent),
    leftovers: normalizeList(leftovers, normalizeLeftover),
  }
}

/** GET /events/{id}: full event (with a freshly signed image_url) + caption. */
export async function fetchEventDetail(id) {
  const res = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const raw = await res.json()
  return { event: normalizeEvent(raw), caption: toText(raw.caption) }
}

// ---- Posting ----

export async function createLeftover({ building, description, postedBy }) {
  if (USE_MOCK) {
    const now = new Date()
    return normalizeLeftover({
      id: Date.now(),
      location_name: building.name,
      lat: building.lat,
      lng: building.lng,
      description,
      posted_by: postedBy,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + LEFTOVER_TTL_MS).toISOString(),
    })
  }
  const res = await fetch(`${API_BASE}/leftovers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location_name: building.name,
      description,
      posted_by: postedBy || null,
    }),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const saved = normalizeLeftover(await res.json())
  // The API returns null lat/lng if it can't match the building name;
  // fall back to our own copy of the building's coords.
  return {
    ...saved,
    lat: saved.lat ?? building.lat,
    lng: saved.lng ?? building.lng,
  }
}
