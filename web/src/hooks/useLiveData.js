import { useCallback, useEffect, useRef, useState } from 'react'
import { POLL_MS, USE_MOCK } from '../config.js'
import { fetchLiveData, getInitialData } from '../lib/api.js'

const initialData = getInitialData()

/**
 * Events + leftovers, polled from the API every POLL_MS (mock data with
 * ?mock=1). Also records when this browser first saw each event that shows
 * up after the first load (detectedAt: { [eventId]: ISO time }), for the feed.
 */
export function useLiveData({ onError } = {}) {
  const [events, setEvents] = useState(initialData.events)
  const [leftovers, setLeftovers] = useState(initialData.leftovers)
  const [detectedAt, setDetectedAt] = useState({})

  const loadRef = useRef(null)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (USE_MOCK) return
    let cancelled = false
    let failing = false
    let loadedOnce = false
    const seen = new Set()

    async function load() {
      try {
        const data = await fetchLiveData()
        if (cancelled) return
        failing = false

        const fresh = {}
        const stamp = new Date().toISOString()
        for (const ev of data.events) {
          if (seen.has(ev.id)) continue
          seen.add(ev.id)
          if (loadedOnce) fresh[ev.id] = stamp
        }
        loadedOnce = true

        setEvents(data.events)
        setLeftovers(data.leftovers)
        if (Object.keys(fresh).length > 0) {
          setDetectedAt((prev) => ({ ...prev, ...fresh }))
        }
      } catch (err) {
        console.error(err)
        // Only report the first failure, not every failed poll.
        if (cancelled || failing) return
        failing = true
        onErrorRef.current?.('Could not load live data — is the API running?')
      }
    }

    loadRef.current = load
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      loadRef.current = null
      clearInterval(id)
    }
  }, [])

  // Poll right now (e.g. after the admin panel runs the pipeline). New
  // events get stamped as "just detected" like any other poll.
  const refresh = useCallback(() => loadRef.current?.(), [])

  return { events, leftovers, setLeftovers, detectedAt, refresh }
}
