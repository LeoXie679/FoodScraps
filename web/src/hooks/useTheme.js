import { useCallback, useLayoutEffect, useState } from 'react'
import { useMediaQuery } from './useMediaQuery.js'

const STORAGE_KEY = 'ffr-theme'

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

/**
 * 'light' | 'dark'. Follows the system setting until the user toggles,
 * then remembers their choice. Sets data-theme on <html> for the CSS.
 */
export function useTheme() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [stored, setStored] = useState(readStored)
  const theme = stored ?? (systemDark ? 'dark' : 'light')

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
  }, [theme])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setStored(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage: the toggle still works this session.
    }
  }, [theme])

  return [theme, toggle]
}
