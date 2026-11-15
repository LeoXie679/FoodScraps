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

// ---- Admin: trigger a scrape + AI run (demo panel, ?admin=1) ----

// Server allows 900s for the scrape + 120s for the AI step; wait a bit longer.
export const ADMIN_RUN_TIMEOUT_MS = 18 * 60 * 1000

export class AdminRunError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'auth' | 'timeout' | 'network' | 'server'
  }
}

function parsePipeline(p) {
  if (!p) return { counts: null, problem: 'The AI step did not run.' }
  if (p.error) return { counts: null, problem: `AI step failed: ${p.error}` }
  let body = null
  try {
    body = JSON.parse(p.body)
  } catch {
    // body is plain text (e.g. an error page)
  }
  if (p.status_code >= 400 || !body || typeof body.total !== 'number') {
    const detail = body?.detail ?? p.body
    return {
      counts: null,
      problem: `AI step returned ${p.status_code}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`,
    }
  }
  const n = (k) => (Number.isFinite(body[k]) ? body[k] : 0)
  return {
    counts: {
      total: n('total'),
      processed: n('processed'),
      not_food: n('not_food'),
      duplicate: n('duplicate'),
      failed: n('failed'),
      // Added by the pipeline on Nov 14: flyers with no date are held back
      // (status 'no_date') and retried on later runs instead of being saved.
      no_date: n('no_date'),
    },
    problem: null,
  }
}

/**
 * POST /admin/scrape-now?limit=N with X-Admin-Token. Resolves to
 * { ok, returncode, stdout, stderr, counts, problem }; throws AdminRunError.
 */
export async function runScrapeNow({ token, limit }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ADMIN_RUN_TIMEOUT_MS)
  let res
  try {
    res = await fetch(
      `${API_BASE}/admin/scrape-now?limit=${encodeURIComponent(limit)}`,
      {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
        signal: controller.signal,
      },
    )
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AdminRunError(
        'timeout',
        `No answer after ${ADMIN_RUN_TIMEOUT_MS / 60000} minutes. The run may still finish on the server; new events will show up on the next poll.`,
      )
    }
    throw new AdminRunError('network', `Couldn't reach the API (${err.message}).`)
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401) {
    throw new AdminRunError('auth', 'Wrong admin token. Enter it again.')
  }
  if (res.status === 504) {
    throw new AdminRunError('timeout', 'The scrape timed out on the server (15 min limit).')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const detail = data?.detail ? `: ${JSON.stringify(data.detail).slice(0, 200)}` : ''
    throw new AdminRunError('server', `Server returned ${res.status}${detail}`)
  }
  return {
    ok: Boolean(data?.ok),
    returncode: data?.returncode ?? null,
    stdout: data?.stdout_tail || '',
    stderr: data?.stderr_tail || '',
    ...parsePipeline(data?.pipeline),
  }
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
