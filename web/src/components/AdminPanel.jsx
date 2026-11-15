import { useEffect, useRef, useState } from 'react'
import { USE_MOCK } from '../config.js'
import { runScrapeNow } from '../lib/api.js'
import { PIPELINE_STEPS } from '../lib/pipeline.js'
import { useModalDismiss } from '../hooks/useModalDismiss.js'
import './AdminPanel.css'

const TOKEN_KEY = 'ffr-admin-token'
const LIMITS = [1, 3, 5]

// The token lives only in sessionStorage (this tab), never in the code.
function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function writeToken(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token still works until the panel unmounts.
  }
}

// The server only answers at the very end, so the active step is a guess
// from elapsed time: scraping is the slow part, then storage, then the AI.
function estimatedStep(seconds) {
  if (seconds < 40) return 0
  if (seconds < 55) return 1
  return 2
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function Summary({ result }) {
  const { counts } = result
  return (
    <div className={`admin-summary${result.ok && !result.problem ? '' : ' admin-summary--warn'}`}>
      {counts ? (
        counts.total === 0 ? (
          <p className="admin-summary__headline">
            No new flyers to read. Nothing new was posted since the last run.
          </p>
        ) : (
          <>
            <p className="admin-summary__headline">
              Read {plural(counts.total, 'flyer')} →{' '}
              <strong>{plural(counts.processed, 'new food event')}</strong>
            </p>
            <p className="admin-summary__sub">
              {plural(counts.not_food, 'post')} without free food ·{' '}
              {counts.no_date > 0 && (
                <>{counts.no_date} without a date (will retry) · </>
              )}
              {plural(counts.duplicate, 'duplicate')} · {counts.failed} failed
            </p>
          </>
        )
      ) : null}
      {!result.ok && (
        <p className="admin-summary__problem">
          The scraper exited with code {result.returncode ?? '?'}, so the AI step
          was skipped. See Details.
        </p>
      )}
      {result.ok && result.problem && (
        <p className="admin-summary__problem">{result.problem}</p>
      )}
    </div>
  )
}

/** Hidden demo panel (?admin=1): run the scraper + AI pipeline on demand. */
export default function AdminPanel({ onClose, onFinished }) {
  const [token, setToken] = useState(readToken)
  const [draft, setDraft] = useState('')
  const [limit, setLimit] = useState(3)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const closeRef = useRef(null)
  const runningRef = useRef(false)

  // Don't let Escape/backdrop close the panel mid-run.
  function requestClose() {
    if (!runningRef.current) onClose()
  }
  useModalDismiss(requestClose, closeRef)

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [running])

  function saveToken(e) {
    e.preventDefault()
    const value = draft.trim()
    if (!value) return
    writeToken(value)
    setToken(value)
    setDraft('')
    setError('')
  }

  function forgetToken() {
    writeToken('')
    setToken('')
  }

  async function run() {
    if (!token || running) return
    setRunning(true)
    runningRef.current = true
    setElapsed(0)
    setResult(null)
    setError('')
    try {
      const r = await runScrapeNow({ token, limit })
      setResult(r)
      onFinished()
    } catch (err) {
      if (err.kind === 'auth') forgetToken()
      setError(err.message)
    } finally {
      setRunning(false)
      runningRef.current = false
    }
  }

  const activeStep = running ? estimatedStep(elapsed) : null
  const allDone = result != null && result.ok && result.counts != null

  return (
    <div
      className="admin-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
      >
        <header className="admin-modal__header">
          <h2 id="admin-title">⚙️ Pipeline demo</h2>
          <button
            ref={closeRef}
            type="button"
            className="admin-modal__close"
            onClick={requestClose}
            disabled={running}
            aria-label="Close"
            title={running ? 'Running… wait for it to finish' : 'Close'}
          >
            ✕
          </button>
        </header>

        <div className="admin-modal__body">
          {USE_MOCK && (
            <p className="admin-error">
              Mock mode (?mock=1) has no backend. Remove it to run the pipeline.
            </p>
          )}

          {/* Token: asked once per tab */}
          {token ? (
            <p className="admin-token">
              🔑 Admin token saved for this tab ·{' '}
              <button
                type="button"
                className="mini-link"
                onClick={forgetToken}
                disabled={running}
              >
                Forget
              </button>
            </p>
          ) : (
            <form className="admin-token-form" onSubmit={saveToken}>
              <label htmlFor="admin-token">Admin token</label>
              <div className="admin-token-form__row">
                <input
                  id="admin-token"
                  type="password"
                  autoComplete="off"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Paste the admin token"
                />
                <button type="submit" className="btn" disabled={!draft.trim()}>
                  Save
                </button>
              </div>
            </form>
          )}

          <fieldset className="admin-limit" disabled={running}>
            <legend>Clubs to scrape</legend>
            {LIMITS.map((n) => (
              <label key={n} className={limit === n ? 'is-active' : ''}>
                <input
                  type="radio"
                  name="admin-limit"
                  value={n}
                  checked={limit === n}
                  onChange={() => setLimit(n)}
                />
                {n}
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            className="btn btn--green admin-run"
            onClick={run}
            disabled={!token || running || USE_MOCK}
          >
            {running ? `Running… ${elapsed}s` : 'Run scraper + AI now'}
          </button>

          {(running || result) && (
            <>
              <ol className={`admin-steps${running ? ' is-running' : ''}`}>
                {PIPELINE_STEPS.map((s, i) => {
                  let state = 'pending'
                  if (allDone) state = 'done'
                  else if (running && i < activeStep) state = 'done'
                  else if (running && i === activeStep) state = 'active'
                  return (
                    <li key={s.done} className={`admin-step admin-step--${state}`}>
                      <span className="admin-step__icon" aria-hidden="true">
                        {state === 'done' ? '✓' : s.icon}
                      </span>
                      <span className="admin-step__text">
                        <strong>{s.active}</strong>
                        <span> {s.via}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
              {running && (
                <p className="admin-hint">
                  {elapsed}s elapsed. This usually takes a minute or more. Steps
                  are estimated; the server reports back at the end.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}

          {result && (
            <>
              <Summary result={result} />
              <details className="admin-details">
                <summary>Details</summary>
                <h4>stdout</h4>
                <pre>{result.stdout || '(empty)'}</pre>
                <h4>stderr</h4>
                <pre>{result.stderr || '(empty)'}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
