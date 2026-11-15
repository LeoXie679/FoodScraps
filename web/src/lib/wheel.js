import { foodEmoji } from './food.js'
import { eventStatus, eventTimes, formatCountdown } from './time.js'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const MIN_SLICES = 3
const MAX_SLICES = 8

function shorten(s, max = 12) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function hasCoords(x) {
  return x.lat != null && x.lng != null
}

function fromEvent(ev, now) {
  return {
    key: `event-${ev.id}`,
    markerKey: `event-${ev.id}`,
    hasPin: hasCoords(ev),
    emoji: foodEmoji(ev.food_desc),
    title: ev.title,
    short: shorten(ev.title),
    location: ev.location_name,
    badge: eventStatus(ev, now),
  }
}

function fromLeftover(lo, now) {
  return {
    key: `leftover-${lo.id}`,
    markerKey: `leftover-${lo.id}`,
    hasPin: hasCoords(lo),
    emoji: foodEmoji(lo.description),
    title: `Leftovers: ${lo.description}`,
    short: shorten(lo.description),
    location: lo.location_name,
    badge: { kind: 'leftover', label: formatCountdown(lo.expires_at, now) },
  }
}

/**
 * Wheel slices: events happening now or starting within 3 hours, plus active
 * leftovers. Topped up with the next upcoming events to reach 3, capped at 8.
 * Events with no listed time are skipped. May return fewer than 3 if there
 * isn't enough food at all, or [] if there's none.
 */
export function wheelCandidates(events, leftovers, now) {
  const timed = events
    .filter((ev) => ev.has_food)
    .map((ev) => ({ ev, ...eventTimes(ev) }))
    .filter((x) => x.start && x.end >= now)
    .sort((a, b) => a.start - b.start)

  const live = leftovers.map((lo) => fromLeftover(lo, now))
  const nowOrSoon = timed.filter((x) => x.start - now <= THREE_HOURS_MS)
  const later = timed.filter((x) => x.start - now > THREE_HOURS_MS)

  const picks = [...live, ...nowOrSoon.map((x) => fromEvent(x.ev, now))]
  for (const x of later) {
    if (picks.length >= MIN_SLICES) break
    picks.push(fromEvent(x.ev, now))
  }
  return picks.slice(0, MAX_SLICES)
}
