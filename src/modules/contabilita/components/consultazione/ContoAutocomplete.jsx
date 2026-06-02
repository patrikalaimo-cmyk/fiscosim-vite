import { useState, useRef, useEffect } from 'react'

export function ContoAutocomplete({ pianoConti = [], selectedContoId, onChange, style }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Resolve selected conto
  const selectedConto = pianoConti.find(c => String(c.id) === String(selectedContoId))

  // Synchronize query text with selected conto or user search
  useEffect(() => {
    if (selectedConto) {
      setQuery(`${selectedConto.codice} - ${selectedConto.descrizione}`)
    } else {
      setQuery('')
    }
  }, [selectedContoId, selectedConto])

  // Filtered options based on query
  const filteredOptions = query && !selectedConto
    ? pianoConti.filter(c => {
        const q = query.trim().toLowerCase()
        return (
          String(c.codice).toLowerCase().includes(q) ||
          String(c.descrizione || '').toLowerCase().includes(q)
        );
      }).slice(0, 50) // Limit to 50 items for speed
    : []

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e) => {
    if (!isOpen && filteredOptions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true)
        setHighlightedIndex(0)
        e.preventDefault()
        return
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => 
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => 
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        selectOption(filteredOptions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    }
  }

  const selectOption = (conto) => {
    onChange({
      contoId: conto.id,
      contoCodice: conto.codice,
      contoDescrizione: conto.descrizione,
      conto: `${conto.codice} - ${conto.descrizione}`
    })
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setIsOpen(true)
    setHighlightedIndex(0)
    
    // If user cleared the input entirely
    if (!val.trim()) {
      onChange({
        contoId: '',
        contoCodice: '',
        contoDescrizione: '',
        conto: ''
      })
    }
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange({
      contoId: '',
      contoCodice: '',
      contoDescrizione: '',
      conto: ''
    })
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  const showList = isOpen && filteredOptions.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Codice o descrizione..."
          style={{
            ...style,
            width: '100%',
            paddingRight: '1.8rem',
            boxSizing: 'border-box'
          }}
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: 'var(--mu)',
              cursor: 'pointer',
              fontSize: '.9rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
            }}
            title="Pulisci selezione"
          >
            ✕
          </button>
        ) : null}
      </div>
      
      {showList ? (
        <ul
          style={{
            position: 'absolute',
            top: '105%',
            left: 0,
            width: '100%',
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#132d46',
            border: '1px solid rgba(96,165,250,.2)',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,.5)',
            zIndex: 9999,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {filteredOptions.map((conto, index) => {
            const isHighlighted = index === highlightedIndex
            return (
              <li
                key={conto.id}
                onClick={() => selectOption(conto)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: '.45rem .65rem',
                  cursor: 'pointer',
                  fontSize: '.74rem',
                  color: isHighlighted ? '#fff' : 'var(--text, #d1d5db)',
                  background: isHighlighted ? 'rgba(232, 146, 42, 0.4)' : 'transparent',
                  transition: 'background .1s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  borderBottom: '1px solid rgba(255,255,255,.02)',
                }}
              >
                <strong>{conto.codice}</strong> - {conto.descrizione}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
