import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import TimeBadge from './TimeBadge.jsx'
import { FeedItem, LiveDot } from './ActivityFeed.jsx'
import { foodEmoji } from '../lib/food.js'
import { eventStatus, formatCountdown } from '../lib/time.js'
import './EventList.css'

const DRAG_THRESHOLD = 40 // px of drag needed to expand/collapse
const TAP_SLOP = 4 // px of movement still treated as a tap

// Leftovers first (soonest to expire), then upcoming/current events by start
// time, then ended events at the bottom.
function buildItems(events, leftovers, now) {
  const leftoverItems = leftovers.map((lo) => ({
    key: `leftover-${lo.id}`,
    emoji: foodEmoji(lo.description),
    title: lo.description,
    location: lo.location_name,
    badge: { kind: 'leftover', label: formatCountdown(lo.expires_at, now) },
    tags: ['leftovers'],
    ended: false,
    rank: 0,
    sortTime: lo.expires_at ? new Date(lo.expires_at).getTime() : Infinity,
  }))
  const eventItems = events.map((ev) => {
    const status = eventStatus(ev, now)
    const ended = status.kind === 'ended'
    return {
      key: `event-${ev.id}`,
      event: ev,
      emoji: foodEmoji(ev.food_desc),
      title: ev.title,
      location: ev.location_name,
      badge: status,
      tags: ev.dietary || [],
      ended,
      rank: ended ? 2 : 1,
      // No listed time → after timed upcoming events, before ended ones.
      sortTime: ev.start_time ? new Date(ev.start_time).getTime() : Infinity,
    }
  })
  return [...leftoverItems, ...eventItems].sort(
    (a, b) => a.rank - b.rank || a.sortTime - b.sortTime,
  )
}

/**
 * List of food spots plus a "Live" activity tab. mode="sheet" is a draggable
 * mobile bottom sheet; mode="sidebar" is a static desktop sidebar.
 */
export default function EventList({
  mode,
  events,
  leftovers,
  feed,
  now,
  onSelect,
  onSelectFeed,
  onShowFlyer,
  onPeekHeight,
}) {
  const isSheet = mode === 'sheet'
  const items = useMemo(
    () => buildItems(events, leftovers, now),
    [events, leftovers, now],
  )
  const spots = items.filter((i) => !i.ended).length
  const summary = `${spots} ${spots === 1 ? 'spot' : 'spots'} with free food`

  const [tab, setTab] = useState('spots')
  const [expanded, setExpanded] = useState(false)
  const [dragY, setDragY] = useState(null)
  const [peek, setPeek] = useState(160)
  const drag = useRef(null)
  const listRef = useRef(null)

  // Collapsed height = everything above the list + its first two rows.
  useLayoutEffect(() => {
    if (!isSheet) return
    const measure = () => {
      const list = listRef.current
      if (!list) return
      const last = list.children[Math.min(1, list.children.length - 1)]
      const h =
        list.offsetTop + (last ? last.offsetTop + last.offsetHeight + 8 : 0)
      setPeek(h)
      onPeekHeight?.(h)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isSheet, items, feed, tab, onPeekHeight])

  // When collapsing, scroll back so the top two rows are what peeks out.
  useEffect(() => {
    if (!expanded && listRef.current) listRef.current.scrollTop = 0
  }, [expanded])

  function handlePointerDown(e) {
    drag.current = { startY: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!drag.current) return
    const dy = e.clientY - drag.current.startY
    drag.current.dy = dy
    if (Math.abs(dy) > TAP_SLOP) setDragY(dy)
  }

  function handlePointerUp() {
    const d = drag.current
    drag.current = null
    setDragY(null)
    if (!d) return
    if (Math.abs(d.dy) <= TAP_SLOP) setExpanded((x) => !x)
    else if (d.dy < -DRAG_THRESHOLD) setExpanded(true)
    else if (d.dy > DRAG_THRESHOLD) setExpanded(false)
  }

  function handlePointerCancel() {
    drag.current = null
    setDragY(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setExpanded((x) => !x)
    }
  }

  function handleSelect(key) {
    if (isSheet) setExpanded(false)
    onSelect(key)
  }

  function handleSelectFeed(item) {
    if (isSheet) setExpanded(false)
    onSelectFeed(item)
  }

  let sheetStyle
  if (isSheet) {
    const base = expanded ? '0px' : `calc(100% - ${peek}px)`
    sheetStyle = {
      transform:
        dragY == null
          ? `translateY(${base})`
          : `translateY(max(0px, calc(${base} + ${dragY}px)))`,
      transition: dragY == null ? 'transform 0.25s ease' : 'none',
    }
  }

  return (
    <section
      className={`event-list event-list--${mode}${expanded ? ' is-expanded' : ''}`}
      style={sheetStyle}
      aria-label="Free food list"
    >
      {isSheet ? (
        <div
          className="event-list__header event-list__header--drag"
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
        >
          <div className="event-list__handle" />
          <strong>{summary}</strong>
        </div>
      ) : (
        <div className="event-list__header">
          <strong>{summary}</strong>
        </div>
      )}

      {/* Outside the drag area so taps on tabs aren't captured by the drag. */}
      <div className="event-list__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'spots'}
          className={`event-list__tab${tab === 'spots' ? ' is-active' : ''}`}
          onClick={() => setTab('spots')}
        >
          Spots
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          className={`event-list__tab${tab === 'live' ? ' is-active' : ''}`}
          onClick={() => setTab('live')}
        >
          <LiveDot withLabel={false} /> Live
          {feed.length > 0 && (
            <span className="event-list__count">{feed.length}</span>
          )}
        </button>
      </div>

      <ul ref={listRef} className="event-list__items" role="tabpanel">
        {tab === 'spots' && (
          <>
            {items.length === 0 && (
              <li className="event-list__empty">Nothing matches this filter.</li>
            )}
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={`event-item${item.ended ? ' event-item--ended' : ''}`}
                  onClick={() => handleSelect(item.key)}
                >
                  <span className="event-item__emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="event-item__body">
                    <span className="event-item__title">{item.title}</span>
                    <span className="event-item__location">{item.location}</span>
                    <span className="event-item__meta">
                      <TimeBadge kind={item.badge.kind} label={item.badge.label} />
                      {item.tags.map((t) => (
                        <span key={t} className="diet-tag">
                          {t}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                {/* Sibling of the row button: buttons can't be nested. */}
                {item.event && (
                  <button
                    type="button"
                    className="link-button event-item__how"
                    onClick={() => onShowFlyer(item.event)}
                  >
                    How we found this ✨
                  </button>
                )}
              </li>
            ))}
          </>
        )}

        {tab === 'live' && (
          <>
            {feed.length === 0 && (
              <li className="event-list__empty">
                No new activity yet. New leftovers and newly detected events
                will show up here.
              </li>
            )}
            {feed.map((item) => (
              <li key={item.key}>
                <FeedItem item={item} onSelect={handleSelectFeed} />
              </li>
            ))}
          </>
        )}
      </ul>
    </section>
  )
}
