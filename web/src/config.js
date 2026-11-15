// Empty API_BASE = same origin (Caddy proxies /events etc on the Vultr box).
// For local dev against a local API, set VITE_API_BASE=http://127.0.0.1:8000
export const USE_MOCK = false
export const API_BASE = import.meta.env.VITE_API_BASE || ''
