// Minimal iCalendar (RFC 5545) export for a single event.

const ONE_HOUR_MS = 60 * 60 * 1000

/** 2026-11-15T01:01:07.787Z → 20261115T010107Z */
function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1')
}

// Lines longer than 75 bytes must be folded (CRLF + space). Count UTF-8
// bytes so emoji and accents don't push a line over.
const encoder = new TextEncoder()
function fold(line) {
  const out = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

export function buildIcs(ev, now = new Date()) {
  const start = new Date(ev.start_time)
  const end = ev.end_time
    ? new Date(ev.end_time)
    : new Date(start.getTime() + ONE_HOUR_MS)

  const description = [
    ev.food_desc && `Food: ${ev.food_desc}`,
    ev.org && `Hosted by: ${ev.org}`,
    ev.source_url && `Source: ${ev.source_url}`,
    'Found with Free Food Radar',
  ]
    .filter(Boolean)
    .join('\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Free Food Radar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${ev.id}@free-food-radar`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    `LOCATION:${escapeText(`${ev.location_name || 'Location TBA'} · UC San Diego`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ev.source_url && `URL:${ev.source_url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return lines.map(fold).join('\r\n') + '\r\n'
}

function fileName(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${slug || 'free-food-event'}.ics`
}

/** Download an .ics for an event. Needs ev.start_time. */
export function downloadIcs(ev) {
  if (!ev.start_time) return
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName(ev.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
