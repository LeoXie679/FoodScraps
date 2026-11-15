import { FILTERS } from '../lib/filters.js'
import FoodWeather from './FoodWeather.jsx'

export default function Header({ filter, onFilterChange, onTogglePost, weather }) {
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
      <button onClick={onTogglePost} className="btn btn--green header__post">
        Post leftovers
      </button>
    </header>
  )
}
