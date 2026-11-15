// Live API by default. Add ?mock=1 to the URL to use bundled mock data
// (offline demos).
//
// API_BASE: set VITE_API_BASE to override. An empty value (VITE_API_BASE=)
// means same origin, which is what the Caddy deploy on the server wants.
const params = new URLSearchParams(window.location.search)

export const USE_MOCK = params.get('mock') === '1'
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'http://155.138.235.133'
export const POLL_MS = 15000

// Only events and leftovers inside this box (roughly UCSD's main campus)
// are shown. Anything without coordinates or outside it is hidden.
export const CAMPUS_BOUNDS = {
  minLat: 32.865,
  maxLat: 32.892,
  minLng: -117.25,
  maxLng: -117.218,
}

// Events that ended more than this long ago are hidden everywhere.
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000

// Live events that pass every rule but aren't real free food (checked by
// hand on Nov 15). Remove ids once the backend stops producing them.
// Note: ids change if the pipeline deletes and re-inserts events.
export const HIDDEN_EVENT_IDS = new Set([
  // "friends giving": HDH Friendsgiving is a paid dining-hall menu, split
  // into one pin per hall (64 Degrees, Pines, Sixth, Ventanas, OceanView,
  // Canyon Vista).
  34, 35, 36, 37, 38, 39,
  31, // COMMUNITY POTLUCK: "Bring a dish", not food being given out
  32, // VSA gbM #4 GIVING THANKS: "ENTRY: $10"
])

// Test/diagnostic rows (e.g. https://example.com/malk-hall-diag-2).
export const HIDDEN_SOURCE_PATTERN = /example\.com/i

// ?admin=1 shows the hidden "⚙️ Pipeline" demo panel. It still needs the
// admin token, which the user types in; nothing secret lives in the code.
export const ADMIN_MODE = params.get('admin') === '1'
