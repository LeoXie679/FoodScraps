import { useEffect, useRef, useState } from 'react'
import TimeBadge from './TimeBadge.jsx'
import { wheelCandidates } from '../lib/wheel.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useModalDismiss } from '../hooks/useModalDismiss.js'
import './FoodWheel.css'

const SPIN_MS = 3000
const R = 96 // wheel radius in SVG units (viewBox is -100..100)
const LABEL_R = 58

function polar(deg, r) {
  // deg is measured clockwise from 12 o'clock
  const rad = ((deg - 90) * Math.PI) / 180
  return [r * Math.cos(rad), r * Math.sin(rad)]
}

function slicePath(i, n) {
  const step = 360 / n
  const [x0, y0] = polar(i * step, R)
  const [x1, y1] = polar((i + 1) * step, R)
  const large = step > 180 ? 1 : 0
  return `M0 0 L${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`
}

function SliceLabel({ i, n, text }) {
  const mid = (i + 0.5) * (360 / n)
  const [x, y] = polar(mid, LABEL_R)
  // Run the text along the radius; flip it on the left half so it's upright.
  const angle = mid - 90 + (mid > 180 ? 180 : 0)
  return (
    <text
      x={x}
      y={y}
      transform={`rotate(${angle} ${x} ${y})`}
      textAnchor="middle"
      dominantBaseline="central"
      className="wheel__label"
    >
      {text}
    </text>
  )
}

/** "I'm hungry" spin-the-wheel modal. Slices are fixed when it opens. */
export default function FoodWheel({ events, leftovers, now, onShowOnMap, onClose }) {
  const [candidates] = useState(() => wheelCandidates(events, leftovers, now))
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [resultIndex, setResultIndex] = useState(null)
  const timer = useRef(null)
  const closeRef = useRef(null)

  useModalDismiss(onClose, closeRef)
  useEffect(() => () => clearTimeout(timer.current), [])

  const n = candidates.length
  const step = n > 0 ? 360 / n : 360

  function spin() {
    if (spinning || n === 0) return
    const i = Math.floor(Math.random() * n)
    // Land somewhere inside slice i (not dead center), under the top pointer.
    const jitter = (Math.random() - 0.5) * step * 0.6
    const target = (((360 - (i + 0.5) * step + jitter) % 360) + 360) % 360
    const current = ((rotation % 360) + 360) % 360
    const delta = (target - current + 360) % 360
    setResultIndex(null)

    if (reduceMotion) {
      setRotation(rotation + delta)
      setResultIndex(i)
      return
    }
    setRotation(rotation + 5 * 360 + delta)
    setSpinning(true)
    timer.current = setTimeout(() => {
      setSpinning(false)
      setResultIndex(i)
    }, SPIN_MS)
  }

  const result = resultIndex == null ? null : candidates[resultIndex]

  return (
    <div
      className="wheel-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="wheel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wheel-title"
      >
        <header className="wheel-modal__header">
          <h2 id="wheel-title">Spin the Food Wheel 🎰</h2>
          <button
            ref={closeRef}
            type="button"
            className="wheel-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {n === 0 ? (
          <div className="wheel-empty">
            <div className="wheel-empty__icon" aria-hidden="true">
              🍽️
            </div>
            <p>No food right now – check back soon</p>
            <button type="button" className="btn" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <>
            <div className="wheel">
              <div className="wheel__pointer" aria-hidden="true" />
              <div
                className="wheel__disc"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: reduceMotion
                    ? 'none'
                    : `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.15, 1)`,
                }}
              >
                <svg viewBox="-100 -100 200 200" role="img" aria-label="Food wheel">
                  {n === 1 ? (
                    <circle r={R} className="wheel__slice wheel__slice--0" />
                  ) : (
                    candidates.map((c, i) => (
                      <path
                        key={c.key}
                        d={slicePath(i, n)}
                        className={`wheel__slice wheel__slice--${i % 8}`}
                      />
                    ))
                  )}
                  {candidates.map((c, i) => (
                    <SliceLabel key={c.key} i={i} n={n} text={`${c.emoji} ${c.short}`} />
                  ))}
                  <circle r={R} className="wheel__rim" />
                </svg>
              </div>
              <button
                type="button"
                className="wheel__hub"
                onClick={spin}
                disabled={spinning}
              >
                {spinning ? '…' : 'SPIN'}
              </button>
            </div>

            <div className="wheel-result" aria-live="polite">
              {result ? (
                <>
                  <div className="wheel-result__emoji" aria-hidden="true">
                    {result.emoji}
                  </div>
                  <div className="wheel-result__body">
                    <strong>{result.title}</strong>
                    {result.location && <span>{result.location}</span>}
                    <span>
                      <TimeBadge kind={result.badge.kind} label={result.badge.label} />
                    </span>
                  </div>
                  <div className="wheel-result__buttons">
                    <button
                      type="button"
                      className="btn btn--green"
                      onClick={() => onShowOnMap(result)}
                      disabled={!result.hasPin}
                      title={result.hasPin ? undefined : 'No map location for this one'}
                    >
                      Show on map
                    </button>
                    <button type="button" className="btn" onClick={spin}>
                      Spin again
                    </button>
                  </div>
                </>
              ) : (
                <p className="wheel-result__hint">
                  {spinning
                    ? 'Spinning…'
                    : `${n} ${n === 1 ? 'option' : 'options'} on the wheel. Tap SPIN!`}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
