import { useEffect, useRef, useState } from 'react'
import './FoodWeather.css'

/** Header badge. Tap to show a one-line forecast. */
export default function FoodWeather({ weather }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return
    function handleDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleDown)
    return () => document.removeEventListener('pointerdown', handleDown)
  }, [open])

  return (
    <div className="food-weather" ref={rootRef}>
      <button
        type="button"
        className={`food-weather__badge food-weather__badge--${weather.kind}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Food weather: ${weather.label}. Show forecast`}
      >
        <span aria-hidden="true">{weather.icon}</span>
        <span>{weather.label}</span>
      </button>
      {open && (
        <div className="food-weather__forecast" role="status">
          {weather.forecast}
        </div>
      )}
    </div>
  )
}
