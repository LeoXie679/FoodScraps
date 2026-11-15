import { useEffect, useRef } from 'react'

/**
 * Modal plumbing: Escape calls onClose, focus moves to focusRef on open and
 * back to the previously focused element on close. Runs once, so parent
 * re-renders (15s polling) don't steal focus.
 */
export function useModalDismiss(onClose, focusRef) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement
    focusRef.current?.focus()
    function handleKey(e) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previous?.focus?.()
    }
  }, [focusRef])
}
