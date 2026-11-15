import { FILTERS } from '../lib/filters.js'
import FoodWeather from './FoodWeather.jsx'

export default function Header({
  filter,
  onFilterChange,
  onTogglePost,
  weather,
  theme,
  onToggleTheme,
  onOpenWheel,
}) {
  const isDark = theme === 'dark'
  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">Free Food Radar</h1>
        <FoodWeather weather={weather} />
      </div>
      <nav className="header__filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`btn chip${filter === f ? ' chip--active' : ''}`}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
      </nav>
      <div className="header__actions">
        <button
          type="button"
          onClick={onToggleTheme}
          className="btn theme-toggle"
          aria-label={isDark ? 'Switch to day mode' : 'Switch to night mode'}
          title={isDark ? 'Day mode' : 'Night mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <button
          type="button"
          onClick={onOpenWheel}
          className="btn btn--hungry"
          aria-label="I’m hungry: spin the food wheel"
          title="I’m hungry: spin the food wheel"
        >
          {/* Label hides below 1100px; the 🎰 stays. */}
          <span className="btn__label">I’m hungry </span>🎰
        </button>
        <button
          type="button"
          onClick={onTogglePost}
          className="btn btn--green btn--post"
          aria-label="Post leftovers"
          title="Post leftovers"
        >
          {/* Phones show just "+". */}
          <span className="btn--post__plus" aria-hidden="true">
            +
          </span>
          <span className="btn--post__label">Post leftovers</span>
        </button>
      </div>
    </header>
  )
}
