import { useState } from 'react'
import buildingsData from '../buildings.json'
import { createLeftover } from '../lib/api.js'

const BUILDINGS = buildingsData.buildings

export default function PostLeftoversPanel({ onPosted, onCancel }) {
  const [buildingName, setBuildingName] = useState(BUILDINGS[0].name)
  const [description, setDescription] = useState('')
  const [postedBy, setPostedBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) {
      setError('Please describe the food.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const building = BUILDINGS.find((b) => b.name === buildingName)
      const leftover = await createLeftover({
        building,
        description: description.trim(),
        postedBy: postedBy.trim(),
      })
      onPosted(leftover)
    } catch (err) {
      setError(`Couldn't post: ${err.message}`)
      setSubmitting(false)
    }
  }

  return (
    <form className="post-panel" onSubmit={handleSubmit}>
      <strong className="post-panel__title">Post leftovers</strong>

      <label className="post-panel__label">
        Building
        <select
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          className="post-panel__input"
        >
          {BUILDINGS.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.aliases?.length ? ` (${b.aliases[0]})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="post-panel__label">
        What food and how much?
        <textarea
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 4 boxes of cheese pizza"
          className="post-panel__input post-panel__textarea"
        />
      </label>

      <label className="post-panel__label">
        Posted by (club name)
        <input
          type="text"
          value={postedBy}
          onChange={(e) => setPostedBy(e.target.value)}
          className="post-panel__input"
        />
      </label>

      {error && <div className="post-panel__error">{error}</div>}

      <div className="post-panel__buttons">
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn btn--green">
          {submitting ? 'Posting…' : 'Submit'}
        </button>
      </div>
    </form>
  )
}
