import { useEffect, useRef } from 'react'

const SLOP = 6 // px a finger can move and still count as a tap
const FLICK_VELOCITY = 0.4 // px/ms; faster than this snaps in the flick direction

/**
 * Touch gestures for the mobile bottom sheet, Google/Apple Maps style:
 *  - collapsed: a vertical swipe anywhere on the sheet drags it
 *  - expanded, list at the top: swiping down drags the sheet
 *  - expanded, list scrolled (or swiping up): the list scrolls natively
 *  - a movement under SLOP is a tap, so list items stay tappable
 *
 * Uses touch events with a non-passive touchmove so we can stop the browser
 * from scrolling once we've decided a swipe is a drag (pointer events can't
 * take a gesture back from the browser once it starts scrolling).
 *
 * onDrag(dy) is called while dragging (dy from where the drag began);
 * onRelease(dy, velocity) when the finger lifts after a drag (velocity in
 * px/ms, positive = downward).
 */
export function useSheetGestures({ enabled, sheetRef, listRef, isExpanded, onDrag, onRelease }) {
  const cb = useRef({ isExpanded, onDrag, onRelease })
  useEffect(() => {
    cb.current = { isExpanded, onDrag, onRelease }
  })

  useEffect(() => {
    const sheet = sheetRef.current
    if (!enabled || !sheet) return
    let g = null

    function start(e) {
      if (e.touches.length !== 1) {
        g = null
        return
      }
      const t = e.touches[0]
      g = {
        x: t.clientX,
        y: t.clientY,
        y0: 0,
        mode: null, // null (undecided) | 'drag' | 'scroll' | 'ignore'
        inList: Boolean(listRef.current?.contains(e.target)),
        samples: [],
      }
    }

    function move(e) {
      if (!g || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - g.x
      const dy = t.clientY - g.y

      if (g.mode === null) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (Math.abs(dx) > Math.abs(dy)) {
          g.mode = 'ignore' // horizontal swipe: leave it alone
          return
        }
        const list = listRef.current
        if (!cb.current.isExpanded) g.mode = 'drag'
        else if (!g.inList) g.mode = 'drag' // handle / summary / tabs
        else if (dy > 0 && list && list.scrollTop <= 0) g.mode = 'drag'
        else g.mode = 'scroll'
        g.y0 = t.clientY // start the drag here so the sheet doesn't jump
      }
      if (g.mode !== 'drag') return

      if (e.cancelable) e.preventDefault() // no page scroll / bounce / refresh
      g.samples.push({ y: t.clientY, t: e.timeStamp })
      if (g.samples.length > 6) g.samples.shift()
      cb.current.onDrag(t.clientY - g.y0)
    }

    function end() {
      const done = g
      g = null
      if (!done || done.mode !== 'drag') return
      const s = done.samples
      const last = s[s.length - 1]
      // Velocity over roughly the last 100 ms of movement.
      const first = s.find((p) => last.t - p.t <= 100) ?? s[0]
      const v = (last.y - first.y) / Math.max(1, last.t - first.t)
      cb.current.onRelease(last.y - done.y0, v)
    }

    function cancel() {
      const done = g
      g = null
      if (done?.mode === 'drag') cb.current.onRelease(0, 0)
    }

    sheet.addEventListener('touchstart', start, { passive: true })
    sheet.addEventListener('touchmove', move, { passive: false })
    sheet.addEventListener('touchend', end)
    sheet.addEventListener('touchcancel', cancel)
    return () => {
      sheet.removeEventListener('touchstart', start)
      sheet.removeEventListener('touchmove', move)
      sheet.removeEventListener('touchend', end)
      sheet.removeEventListener('touchcancel', cancel)
    }
  }, [enabled, sheetRef, listRef])
}

export { FLICK_VELOCITY }
