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
  const s = new Date(start)
  const e = new Date(end)
  return `${s.toLocaleDateString(undefined, dateFmt)}, ${formatClock(s)} – ${formatClock(e)}`
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
 * kind: 'now' | 'soon' | 'later' | 'ended'
 */
export function eventStatus(ev, now) {
  const start = new Date(ev.start_time)
  const end = new Date(ev.end_time)

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

/** "Gone in 1h 12m" style countdown to a leftover's expiry. */
export function formatCountdown(expiresAt, now) {
  const ms = new Date(expiresAt) - now
  if (ms <= 0) return 'Gone'
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return 'Gone in <1m'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `Gone in ${h}h ${m}m` : `Gone in ${m}m`
}
