import { isSameDay } from './time.js'

export const FILTERS = ['all', 'now', 'today', 'vegetarian', 'halal']

export function isDietFilter(filter) {
  return filter === 'vegetarian' || filter === 'halal'
}

export function eventMatches(ev, filter, now) {
  const start = new Date(ev.start_time)
  const end = new Date(ev.end_time)
  switch (filter) {
    case 'now':
      return start <= now && now <= end
    case 'today':
      return isSameDay(start, now) && end >= now
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
  return new Date(lo.expires_at) >= now
}
