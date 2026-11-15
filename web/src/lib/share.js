import { USE_MOCK } from '../config.js'
import { formatTimeRange } from './time.js'

/** This site + ?event=<id> (keeps ?mock=1 so mock links open mock data). */
export function eventShareUrl(id) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (USE_MOCK) url.searchParams.set('mock', '1')
  url.searchParams.set('event', String(id))
  return url.toString()
}

function shareText(ev) {
  const where = ev.location_name ? ` at ${ev.location_name}` : ''
  const when = ev.start_time ? ` · ${formatTimeRange(ev.start_time, ev.end_time)}` : ''
  const food = ev.food_desc ? ` · ${ev.food_desc}` : ''
  return `Free food: ${ev.title}${where}${when}${food}`
}

// Old-school copy that also works on plain-HTTP pages, where
// navigator.clipboard doesn't exist.
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

/**
 * Share an event. Tries the native share sheet, then the clipboard, then
 * gives up and returns the link for the UI to show.
 * Resolves to { status: 'shared' | 'cancelled' | 'copied' | 'manual', url, text }.
 */
export async function shareEvent(ev) {
  const url = eventShareUrl(ev.id)
  const text = shareText(ev)

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: ev.title, text, url })
      return { status: 'shared', url, text }
    } catch (err) {
      if (err?.name === 'AbortError') return { status: 'cancelled', url, text }
      // Any other failure: fall through to copying.
    }
  }

  const full = `${text}\n${url}`
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(full)
      return { status: 'copied', url, text }
    } catch {
      // Permission denied etc.: try the legacy way.
    }
  }
  if (legacyCopy(full)) return { status: 'copied', url, text }

  return { status: 'manual', url, text }
}
