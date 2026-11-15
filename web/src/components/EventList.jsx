import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import TimeBadge from './TimeBadge.jsx'
import { FeedItem, LiveDot } from './ActivityFeed.jsx'
import EventActions from './EventActions.jsx'
import { foodEmoji } from '../lib/food.js'
import { eventStatus, formatCountdown } from '../lib/time.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { FLICK_VELOCITY, useSheetGestures } from '../hooks/useSheetGestures.js'
import './EventList.css'

const TAP_SLOP = 4 // px of mouse movement still treated as a click

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
      emoji: foodEmoji(ev.food_desc, ev.title),
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
  onShare,
  onPeekHeight,
  hiddenCount = 0,
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
  const sheetRef = useRef(null)
  const suppressClickUntil = useRef(0)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  // Snap to collapsed/expanded when a drag ends: a fast flick goes in its
  // direction; otherwise it snaps over once dragged past 25% of the way.
  function snapAfterDrag(dy, velocity) {
    const travel = Math.max(1, (sheetRef.current?.offsetHeight ?? 0) - peek)
    let next = expanded
    if (Math.abs(velocity) > FLICK_VELOCITY) next = velocity < 0
    else if (expanded && dy > travel * 0.25) next = false
    else if (!expanded && -dy > travel * 0.25) next = true
    setDragY(null)
    setExpanded(next)
    // A drag that ends over the header shouldn't also count as a tap on it.
    suppressClickUntil.current = Date.now() + 400
  }

  useSheetGestures({
    enabled: isSheet,
    sheetRef,
    listRef,
    isExpanded: expanded,
    onDrag: setDragY,
    onRelease: snapAfterDrag,
  })

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

  // Mouse: drag the handle area (touch is handled by useSheetGestures).
  function handlePointerDown(e) {
    if (e.pointerType !== 'mouse') return
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
    if (!d) return
    if (Math.abs(d.dy) > TAP_SLOP) snapAfterDrag(d.dy, 0)
    else setDragY(null) // a click: handled by onClick below
  }

  function handlePointerCancel() {
    drag.current = null
    setDragY(null)
  }

  // Tapping/clicking the handle area toggles the sheet.
  function handleHeaderClick() {
    if (Date.now() < suppressClickUntil.current) return
    setExpanded((x) => !x)
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
    // Snap points: expanded = top of the sheet (≈85% of the screen tall);
    // collapsed = only the peek (handle + summary + tabs + 2 rows) showing,
    // kept above the iPhone home indicator.
    const collapsedY = `calc(100% - ${peek}px - env(safe-area-inset-bottom, 0px))`
    const base = expanded ? '0px' : collapsedY
    sheetStyle = {
      transform:
        dragY == null
          ? `translateY(${base})`
          : `translateY(clamp(0px, calc(${base} + ${dragY}px), ${collapsedY}))`,
      transition:
        dragY != null || reduceMotion
          ? 'none'
          : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
    }
  }

  return (
    <section
      ref={sheetRef}
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
          onClick={handleHeaderClick}
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
                {/* Siblings of the row button: buttons can't be nested. */}
                {item.event && (
                  <div className="event-item__actions">
                    <button
                      type="button"
                      className="mini-link"
                      onClick={() => onShowFlyer(item.event)}
                    >
                      ✨ How we found this
                    </button>
                    <EventActions event={item.event} onShare={onShare} variant="mini" />
                  </div>
                )}
              </li>
            ))}
            {hiddenCount > 0 && (
              <li className="event-list__hidden-note">
                {hiddenCount} off-campus or unplaced{' '}
                {hiddenCount === 1 ? 'event' : 'events'} hidden
              </li>
            )}
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
