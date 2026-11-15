const DAY_MS = 24 * 60 * 60 * 1000
const timeFmt = { hour: 'numeric', minute: '2-digit' }
const dateFmt = { weekday: 'short', month: 'short', day: 'numeric' }

export function formatClock(date) {
  return date.toLocaleTimeString(undefined, timeFmt)
}

export function formatTime(t) {
  const d = new Date(t)
  return `${d.toLocaleDateString(undefined, dateFmt)}, ${formatClock(d)}`
}

export function formatTimeRange(start, end) {
  if (!start) return 'Time not listed'
  const s = new Date(start)
  const day = `${s.toLocaleDateString(undefined, dateFmt)}, ${formatClock(s)}`
  return end ? `${day} – ${formatClock(new Date(end))}` : day
}

// Events with no end_time are treated as 2 hours long everywhere in the app
// (badges, filters, wheel, weather, staleness). Calendar files use 1 hour
// instead (see CALENDAR_DEFAULT_DURATION_MS in ics.js).
export const ASSUMED_DURATION_MS = 2 * 60 * 60 * 1000

/** Start/end as Dates. No end → start + 2h. No start → both null. */
export function eventTimes(ev) {
  if (!ev.start_time) return { start: null, end: null }
  const start = new Date(ev.start_time)
  const end = ev.end_time
    ? new Date(ev.end_time)
    : new Date(start.getTime() + ASSUMED_DURATION_MS)
  return { start, end }
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Where an event is in time, as { kind, label }.
 * kind: 'now' | 'soon' | 'later' | 'ended' | 'unknown'
 */
export function eventStatus(ev, now) {
  const { start, end } = eventTimes(ev)
  if (!start) return { kind: 'unknown', label: 'Time not listed' }

  if (now > end) return { kind: 'ended', label: 'Ended – food probably gone' }
  if (now >= start) return { kind: 'now', label: 'Happening now' }

  const mins = Math.ceil((start - now) / 60000)
  if (mins <= 120) return { kind: 'soon', label: `Starts in ${mins} min` }

  const clock = formatClock(start)
  if (isSameDay(start, now)) return { kind: 'later', label: `Today ${clock}` }

  const daysAway = Math.round((startOfDay(start) - startOfDay(now)) / DAY_MS)
  const day =
    daysAway < 7
      ? start.toLocaleDateString(undefined, { weekday: 'short' })
      : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { kind: 'later', label: `${day} ${clock}` }
}

/** "9 PM" style hour label. */
export function formatHour(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric' })
}

/** "just now" / "4 min ago" / "2 h ago" / "Nov 12". Future times count as now. */
export function formatAgo(ts, now) {
  const mins = Math.floor((now - new Date(ts)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** "Gone in 1h 12m" style countdown to a leftover's expiry. */
export function formatCountdown(expiresAt, now) {
  if (!expiresAt) return 'Expiry unknown'
  const ms = new Date(expiresAt) - now
  if (ms <= 0) return 'Gone'
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return 'Gone in <1m'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `Gone in ${h}h ${m}m` : `Gone in ${m}m`
}
