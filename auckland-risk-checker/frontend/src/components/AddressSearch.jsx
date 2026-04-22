import { useState, useRef, useEffect } from 'react'
import './SearchForm.css'

export default function AddressSearch({ onSearch, onSuggestSelect, loading }) {
  const [value, setValue]         = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef(null)
  const wrapperRef  = useRef(null)

  // Close suggestions when clicking outside the component
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setValue(q)
    setActiveIdx(-1)

    clearTimeout(debounceRef.current)
    if (q.trim().length < 3) { setSuggestions([]); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/suggest?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      } catch {
        setSuggestions([])
      }
    }, 300)
  }

  function handleSelect(suggestion) {
    setValue(suggestion.address)
    setSuggestions([])
    setActiveIdx(-1)
    onSuggestSelect(suggestion)
  }

  function handleKeyDown(e) {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setSuggestions([])
      setActiveIdx(-1)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setSuggestions([])
    // If user pressed Enter with a highlighted suggestion, select it
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      handleSelect(suggestions[activeIdx])
    } else {
      onSearch(trimmed)
    }
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-inner">
        <label className="search-label" htmlFor="address-input">
          Enter an Auckland property address
        </label>
        <div className="search-row" ref={wrapperRef}>
          <div className="search-input-wrap">
            <input
              id="address-input"
              className="search-input"
              type="text"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 135 Albert Street, Auckland CBD"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
            />
            {suggestions.length > 0 && (
              <ul className="suggestions-list" role="listbox">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    // onMouseDown fires before onBlur so the click registers before the
                    // input loses focus and potentially closes the list
                    onMouseDown={() => handleSelect(s)}
                    className={`suggestion-item${i === activeIdx ? ' active' : ''}`}
                    role="option"
                    aria-selected={i === activeIdx}
                  >
                    {s.address}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="search-btn"
            type="submit"
            disabled={loading || !value.trim()}
          >
            {loading ? 'Checking…' : 'Check risks'}
          </button>
        </div>
        <p className="search-hint">
          Start typing your address and select from the suggestions
        </p>
      </div>
    </form>
  )
}
