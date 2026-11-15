import { foodEmoji } from './food.js'
import { formatAgo } from './time.js'

// Items stamped after this are "new" and get the slide-in animation.
export const PAGE_LOADED_AT = new Date()

function at(location) {
  return location ? ` at ${location}` : ''
}

function hasCoords(x) {
  return x.lat != null && x.lng != null
}

/**
 * Activity feed items, newest first.
 * - Leftovers: stamped with created_at.
 * - Events: created_at if the API sends it; otherwise the time this browser
 *   first saw the event while polling (detectedAt[id]). Events that were
 *   already there at page load have neither and are left out.
 */
export function buildFeed(events, leftovers, detectedAt, now) {
  const items = []

  for (const lo of leftovers) {
    if (!lo.created_at) continue
    const ts = new Date(lo.created_at)
    items.push({
      key: `feed-leftover-${lo.id}`,
      markerKey: `leftover-${lo.id}`,
      hasPin: hasCoords(lo),
      emoji: foodEmoji(lo.description),
      text: `Leftover posted${at(lo.location_name)}`,
      ago: formatAgo(ts, now),
      ts,
    })
  }

  for (const ev of events) {
    if (!ev.has_food) continue
    let ts
    let text
    let ago
    if (ev.created_at) {
      ts = new Date(ev.created_at)
      text = `New event: ${ev.title}${at(ev.location_name)}`
      ago = formatAgo(ts, now)
    } else if (detectedAt[ev.id]) {
      ts = new Date(detectedAt[ev.id])
      text = `New event detected: ${ev.title}${at(ev.location_name)}`
      const rel = formatAgo(ts, now)
      ago = rel === 'just now' ? 'just detected' : `detected ${rel}`
    } else {
      continue
    }
    items.push({
      key: `feed-event-${ev.id}`,
      markerKey: `event-${ev.id}`,
      hasPin: hasCoords(ev),
      emoji: foodEmoji(ev.food_desc, ev.title),
      text,
      ago,
      ts,
    })
  }

  return items
    .map((item) => ({ ...item, isNew: item.ts >= PAGE_LOADED_AT }))
    .sort((a, b) => b.ts - a.ts)
}
