import L from 'leaflet'
import { Marker, Popup } from 'react-leaflet'
import TimeBadge from './TimeBadge.jsx'
import { foodEmoji } from '../lib/food.js'
import {
  eventStatus,
  formatCountdown,
  formatTime,
  formatTimeRange,
} from '../lib/time.js'
import './FoodMarker.css'

// One shared L.DivIcon per emoji/variant so markers don't re-create icons
// on every render. The emoji comes from our own fixed table, never user text.
const iconCache = new Map()

function emojiIcon(emoji, variant) {
  const key = `${variant}:${emoji}`
  if (!iconCache.has(key)) {
    const size = variant === 'leftover' ? 42 : 36
    const ring = variant === 'leftover' ? '<span class="food-pin__ring"></span>' : ''
    iconCache.set(
      key,
      L.divIcon({
        className: `food-pin food-pin--${variant}`,
        html: `${ring}<span class="food-pin__emoji">${emoji}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      }),
    )
  }
  return iconCache.get(key)
}

export function EventMarker({ event, now, onShowFlyer, ref }) {
  const status = eventStatus(event, now)
  return (
    <Marker
      ref={ref}
      position={[event.mapLat ?? event.lat, event.mapLng ?? event.lng]}
      icon={emojiIcon(foodEmoji(event.food_desc), 'event')}
      opacity={0.35 + 0.65 * (event.confidence ?? 0)}
    >
      <Popup>
        <div className="popup">
          <strong>{event.title}</strong>
          {event.org && <div>{event.org}</div>}
          {event.location_name && <div>{event.location_name}</div>}
          <div>{formatTimeRange(event.start_time, event.end_time)}</div>
          <div>
            <TimeBadge kind={status.kind} label={status.label} />
          </div>
          {event.food_desc && (
            <div>
              {foodEmoji(event.food_desc)} {event.food_desc}
            </div>
          )}
          {event.dietary?.length > 0 && (
            <div className="popup__tags">
              {event.dietary.map((d) => (
                <span key={d} className="diet-tag">
                  {d}
                </span>
              ))}
            </div>
          )}
          {event.image_url && (
            <img
              src={event.image_url}
              alt={`${event.title} flyer`}
              className="popup__flyer"
              // Signed flyer URLs expire after 6h; hide the image if it fails.
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <div className="popup__links">
            {event.source_url && (
              <a href={event.source_url} target="_blank" rel="noreferrer">
                source
              </a>
            )}
            <button
              type="button"
              className="link-button"
              onClick={() => onShowFlyer(event)}
            >
              How we found this ✨
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}

export function LeftoverMarker({ leftover, now, ref }) {
  return (
    <Marker
      ref={ref}
      position={[leftover.mapLat ?? leftover.lat, leftover.mapLng ?? leftover.lng]}
      icon={emojiIcon(foodEmoji(leftover.description), 'leftover')}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="popup">
          <strong>Leftovers!</strong>
          {leftover.location_name && <div>{leftover.location_name}</div>}
          <div>{leftover.description}</div>
          {leftover.posted_by && <div>Posted by {leftover.posted_by}</div>}
          <div>
            <TimeBadge
              kind="leftover"
              label={formatCountdown(leftover.expires_at, now)}
            />
          </div>
          {leftover.expires_at && (
            <div className="popup__muted">
              Expires {formatTime(leftover.expires_at)}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
