import { downloadIcs } from '../lib/ics.js'

const CLASS = {
  links: 'link-button', // popups
  buttons: 'btn', // flyer panel
  mini: 'mini-link', // list rows: small, muted
}

/**
 * Share + Add to calendar for one event. The calendar button only shows
 * when the event has a start time.
 */
export default function EventActions({ event, onShare, variant = 'links' }) {
  const cls = CLASS[variant] ?? CLASS.links
  const mini = variant === 'mini'
  return (
    <>
      <button type="button" className={cls} onClick={() => onShare(event)}>
        📤 Share
      </button>
      {event.start_time && (
        <button
          type="button"
          className={cls}
          onClick={() => downloadIcs(event)}
          aria-label={mini ? 'Add to calendar' : undefined}
        >
          📅 {mini ? 'Calendar' : 'Add to calendar'}
        </button>
      )}
    </>
  )
}
