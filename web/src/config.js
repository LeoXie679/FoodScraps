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

// ?admin=1 shows the hidden "⚙️ Pipeline" demo panel. It still needs the
// admin token, which the user types in; nothing secret lives in the code.
export const ADMIN_MODE = params.get('admin') === '1'
