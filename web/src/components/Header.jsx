import { FILTERS } from '../lib/filters.js'

export default function Header({ filter, onFilterChange, onTogglePost }) {
  return (
    <header className="header">
      <h1 className="header__title">Free Food Radar</h1>
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
