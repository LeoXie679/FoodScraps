import { eventStatus, eventTimes, formatHour, isSameDay } from './time.js'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000

export const WEATHER = {
  storm: { icon: '⛈️', label: 'Food storm' },
  sunny: { icon: '☀️', label: 'Sunny' },
  cloudy: { icon: '⛅', label: 'Cloudy' },
  dry: { icon: '🌧️', label: 'Dry spell' },
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Next whole hour strictly after `date` (9:01 PM → 10 PM, 9:00 PM → 10 PM). */
function nextHour(date) {
  const d = new Date(date)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

/**
 * "Food weather" from the full (unfiltered) data. Events with no listed time
 * are ignored; active leftovers count as happening now.
 * Returns { kind, icon, label, forecast }.
 */
export function computeWeather(events, leftovers, now) {
  const timed = events
    .filter((ev) => ev.has_food)
    .map((ev) => ({ ev, ...eventTimes(ev) }))
    .filter((x) => x.start)

  const happeningNow =
    timed.filter((x) => x.start <= now && now <= x.end).length + leftovers.length
  const upcoming = timed.filter((x) => x.start > now)
  const soon = upcoming.filter((x) => x.start - now <= THREE_HOURS_MS).length
  const laterToday = upcoming.filter((x) => isSameDay(x.start, now))

  let kind
  if (happeningNow >= 3) kind = 'storm'
  else if (happeningNow >= 1 || soon >= 4) kind = 'sunny'
  else if (laterToday.length > 0) kind = 'cloudy'
  else kind = 'dry'

  const parts = []
  if (happeningNow > 0) parts.push(`${plural(happeningNow, 'spot')} now`)
  if (laterToday.length > 0) {
    const last = new Date(Math.max(...laterToday.map((x) => x.start)))
    const n = laterToday.length
    parts.push(
      `${happeningNow > 0 ? `${n} more` : plural(n, 'event')} before ${formatHour(nextHour(last))}`,
    )
  }
  if (parts.length === 0) {
    const next = upcoming.sort((a, b) => a.start - b.start)[0]
    parts.push(
      next
        ? `Nothing more today · next: ${eventStatus(next.ev, now).label}${next.ev.location_name ? ` at ${next.ev.location_name}` : ''}`
        : 'Nothing on the radar yet',
    )
  }

  return { kind, ...WEATHER[kind], forecast: parts.join(', ') }
}
