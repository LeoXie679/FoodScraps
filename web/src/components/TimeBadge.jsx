import './TimeBadge.css'

/** kind: 'now' | 'soon' | 'later' | 'ended' | 'unknown' | 'leftover' */
export default function TimeBadge({ kind, label }) {
  return <span className={`time-badge time-badge--${kind}`}>{label}</span>
}
