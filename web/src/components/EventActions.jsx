import { downloadIcs } from '../lib/ics.js'

/**
 * Share + Add to calendar for one event. variant="links" renders link-style
 * buttons (popups, list rows); variant="buttons" renders regular buttons.
 * The calendar button only shows when the event has a start time.
 */
export default function EventActions({ event, onShare, variant = 'links' }) {
  const cls = variant === 'links' ? 'link-button' : 'btn'
  return (
    <>
      <button type="button" className={cls} onClick={() => onShare(event)}>
        📤 Share
      </button>
      {event.start_time && (
        <button type="button" className={cls} onClick={() => downloadIcs(event)}>
          📅 Add to calendar
        </button>
      )}
    </>
  )
}
