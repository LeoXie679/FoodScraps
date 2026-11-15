import './ActivityFeed.css'

export function LiveDot({ withLabel = true }) {
  return (
    <span className="live-dot">
      <span className="live-dot__dot" aria-hidden="true" />
      {withLabel && <span className="live-dot__label">LIVE</span>}
    </span>
  )
}

/** One feed row, used in the "Live" tab of the list. */
export function FeedItem({ item, onSelect }) {
  return (
    <button
      type="button"
      className={`feed-item${item.isNew ? ' feed-item--new' : ''}`}
      onClick={() => onSelect(item)}
    >
      <span className="feed-item__emoji" aria-hidden="true">
        {item.emoji}
      </span>
      <span className="feed-item__text">
        {item.text}
        <span className="feed-item__ago"> · {item.ago}</span>
      </span>
    </button>
  )
}

/** Compact one-line ticker under the header showing the newest item. */
export default function ActivityTicker({ items, onSelect }) {
  const latest = items[0]
  return (
    <div className="ticker">
      <LiveDot />
      {latest ? (
        <button
          type="button"
          // Re-keying on the newest item re-mounts it, which plays the slide-in.
          key={latest.key}
          className={`ticker__item${latest.isNew ? ' ticker__item--new' : ''}`}
          onClick={() => onSelect(latest)}
        >
          <span aria-hidden="true">{latest.emoji}</span> {latest.text}
          <span className="ticker__ago"> · {latest.ago}</span>
        </button>
      ) : (
        <span className="ticker__idle">Watching for new food…</span>
      )}
    </div>
  )
}
