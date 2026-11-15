import { eventTimes, isSameDay } from './time.js'

export const FILTERS = ['all', 'now', 'today', 'vegetarian', 'halal']

export function isDietFilter(filter) {
  return filter === 'vegetarian' || filter === 'halal'
}

export function eventMatches(ev, filter, now) {
  const { start, end } = eventTimes(ev)
  switch (filter) {
    // Events with no listed time can't be "now" or "today".
    case 'now':
      return start != null && start <= now && now <= end
    case 'today':
      return start != null && isSameDay(start, now) && end >= now
    case 'vegetarian':
    case 'halal':
      return (ev.dietary || []).includes(filter)
    default:
      return true
  }
}

// Leftovers have no dietary info, so they're hidden under the diet filters.
export function leftoverMatches(lo, filter, now) {
  if (isDietFilter(filter)) return false
  // No expiry from the API → trust that /leftovers/active only sends live ones.
  return !lo.expires_at || new Date(lo.expires_at) >= now
}
