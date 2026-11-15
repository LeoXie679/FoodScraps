import { useEffect, useRef, useState } from 'react'
import { USE_MOCK } from '../config.js'
import { fetchEventDetail } from '../lib/api.js'
import { formatTimeRange } from '../lib/time.js'
import { useModalDismiss } from '../hooks/useModalDismiss.js'
import EventActions from './EventActions.jsx'
import './FlyerModal.css'

const PIPELINE_STEPS = [
  { icon: '📸', title: 'Scraped from Instagram', via: 'Bright Data' },
  { icon: '🗄️', title: 'Stored', via: 'Vultr Object Storage' },
  { icon: '🤖', title: 'Read by AI', via: 'Vultr Serverless Inference' },
  { icon: '📍', title: 'Matched to building', via: 'Neon Postgres' },
]

function confidenceLevel(c) {
  if (c >= 0.8) return { key: 'high', label: 'High' }
  if (c >= 0.6) return { key: 'medium', label: 'Medium' }
  return { key: 'low', label: 'Low' }
}

function FieldRow({ label, value }) {
  const found = value != null && value !== ''
  return (
    <li className={`flyer-field${found ? '' : ' flyer-field--missing'}`}>
      <span className="flyer-field__mark" aria-hidden="true">
        {found ? '✓' : '–'}
      </span>
      <span className="flyer-field__label">{label}</span>
      <span className="flyer-field__value">{found ? value : 'not found'}</span>
    </li>
  )
}

/**
 * "How we found this" — the original flyer next to what the AI extracted.
 * Full screen on phones, centered card on desktop.
 */
export default function FlyerModal({ event, onClose, onShare }) {
  const [detail, setDetail] = useState(null)
  const [status, setStatus] = useState(USE_MOCK ? 'mock' : 'loading')
  const [failedUrl, setFailedUrl] = useState(null)
  const closeRef = useRef(null)

  // Full details + caption (and a fresh signed image URL) from the API.
  useEffect(() => {
    if (USE_MOCK) return
    let cancelled = false
    fetchEventDetail(event.id)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setStatus('ok')
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  useModalDismiss(onClose, closeRef)

  const ev = detail?.event ?? event
  const showImage = ev.image_url && failedUrl !== ev.image_url
  const level = confidenceLevel(ev.confidence)
  const pct = Math.round(ev.confidence * 100)

  let captionBody
  if (status === 'loading') captionBody = <p className="flyer-muted">Loading…</p>
  else if (status === 'error')
    captionBody = <p className="flyer-muted">Couldn’t load the caption.</p>
  else if (status === 'mock')
    captionBody = <p className="flyer-muted">Not available in mock data.</p>
  else if (!detail?.caption)
    captionBody = <p className="flyer-muted">This post has no caption.</p>
  else captionBody = <p className="flyer-caption">{detail.caption}</p>

  return (
    <div
      className="flyer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flyer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flyer-modal-title"
      >
        <header className="flyer-modal__header">
          <h2 id="flyer-modal-title">How we found this ✨</h2>
          <button
            ref={closeRef}
            type="button"
            className="flyer-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flyer-modal__body">
          <div className="flyer-modal__image">
            {showImage ? (
              <img
                key={ev.image_url}
                src={ev.image_url}
                alt={`Flyer for ${ev.title}`}
                onError={() => setFailedUrl(ev.image_url)}
              />
            ) : (
              <div className="flyer-modal__noimage">Flyer image unavailable</div>
            )}
          </div>

          <div className="flyer-modal__info">
            <section>
              <h3>What our AI read from this flyer</h3>
              <ul className="flyer-fields">
                <FieldRow label="Title" value={ev.found?.title === false ? null : ev.title} />
                <FieldRow label="Organization" value={ev.org} />
                <FieldRow
                  label="Date & time"
                  value={ev.start_time ? formatTimeRange(ev.start_time, ev.end_time) : null}
                />
                <FieldRow label="Location" value={ev.location_name} />
                <FieldRow label="Food" value={ev.food_desc} />
                <FieldRow
                  label="Dietary"
                  value={
                    ev.dietary?.length ? (
                      <span className="flyer-tags">
                        {ev.dietary.map((d) => (
                          <span key={d} className="diet-tag">
                            {d}
                          </span>
                        ))}
                      </span>
                    ) : null
                  }
                />
              </ul>
            </section>

            <section>
              <h3>
                AI confidence:{' '}
                <span className={`flyer-level flyer-level--${level.key}`}>
                  {level.label} · {pct}%
                </span>
              </h3>
              <div
                className="flyer-bar"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="AI confidence"
              >
                <div
                  className={`flyer-bar__fill flyer-bar__fill--${level.key}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {ev.found?.confidence === false && (
                <p className="flyer-muted">Not reported by the AI — assuming 70%.</p>
              )}
            </section>

            <details className="flyer-details">
              <summary>Original post caption</summary>
              {captionBody}
            </details>

            <section>
              <h3>How it got here</h3>
              <ol className="flyer-pipeline">
                {PIPELINE_STEPS.map((s) => (
                  <li key={s.title}>
                    <span className="flyer-pipeline__icon" aria-hidden="true">
                      {s.icon}
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      <span className="flyer-muted"> · {s.via}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flyer-modal__actions">
              {ev.source_url && (
                <a
                  className="btn flyer-modal__source"
                  href={ev.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View original post ↗
                </a>
              )}
              <EventActions event={ev} onShare={onShare} variant="buttons" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
