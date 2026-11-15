import {
  CAMPUS_BOUNDS,
  HIDDEN_EVENT_IDS,
  HIDDEN_SOURCE_PATTERN,
  STALE_AFTER_MS,
} from '../config.js'
import { eventTimes } from './time.js'

export function isOnCampus(x) {
  if (x.lat == null || x.lng == null) return false
  const b = CAMPUS_BOUNDS
  return x.lat >= b.minLat && x.lat <= b.maxLat && x.lng >= b.minLng && x.lng <= b.maxLng
}

/**
 * Why an event is hidden, or null if it's shown.
 * 'hidden-id' | 'test-source' | 'zero-confidence' | 'stale' |
 * 'unplaced' (no coordinates) | 'off-campus'
 * Location is checked last so the "off-campus or unplaced" count only
 * includes events that would otherwise have been shown.
 */
export function eventHiddenReason(ev, now) {
  if (HIDDEN_EVENT_IDS.has(Number(ev.id))) return 'hidden-id'
  if (ev.source_url && HIDDEN_SOURCE_PATTERN.test(ev.source_url)) return 'test-source'
  // A missing confidence is normalized to 0.7, so 0 here really means 0.
  if (ev.confidence === 0) return 'zero-confidence'
  const { end } = eventTimes(ev) // no end_time → start + 2h
  if (end && now - end > STALE_AFTER_MS) return 'stale'
  if (ev.lat == null || ev.lng == null) return 'unplaced'
  if (!isOnCampus(ev)) return 'off-campus'
  return null
}

/**
 * Apply the on-campus + freshness rules once, before anything else sees the
 * data, so the map, list, wheel, feed, weather and counts all agree.
 * locationHidden counts events hidden for having no place or being off campus.
 */
export function applyVisibility(events, leftovers, now) {
  const shownEvents = []
  let locationHidden = 0
  for (const ev of events) {
    const reason = eventHiddenReason(ev, now)
    if (!reason) shownEvents.push(ev)
    else if (reason === 'unplaced' || reason === 'off-campus') locationHidden += 1
  }
  return {
    events: shownEvents,
    leftovers: leftovers.filter(isOnCampus), // freshness rules don't apply
    locationHidden,
  }
}
