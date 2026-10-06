import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildRegistrazioneContoSelection,
  filterRegistrazioneConti,
  resolveRegistrazioneContoLabel,
  resolveContoHierarchyView,
} from '../../application/registrazioneOperations/resolveRegistrazioneConti.js'

function resolveContoMeta(item) {
  const hierarchy = resolveContoHierarchyView(item)
  const meta = [
    `Tipo: ${hierarchy.hierarchyLabel}`,
    hierarchy.level != null ? `Livello ${hierarchy.level}` : '',
  ].filter(Boolean)
  return meta.length ? meta.join(' · ') : 'Conto disponibile'
}

function enrichSelectedConto(item) {
  return buildRegistrazioneContoSelection(item)
}

function canSelectConto(item, selectionMode) {
  const hierarchy = resolveContoHierarchyView(item)
  if (selectionMode === 'template') return hierarchy.hierarchyType !== 'mastro'
  return hierarchy.isSelectableForRegistrazione
}

function invalidSelectionMessage(item, selectionMode) {
  const hierarchy = resolveContoHierarchyView(item)
  if (selectionMode === 'template' && hierarchy.hierarchyType === 'mastro') return 'Seleziona un conto o un sottoconto'
  if (selectionMode !== 'template' && !hierarchy.isSelectableForRegistrazione) return 'Per registrare serve un sottoconto'
  return ''
}

export function RegistrazioneAccountSearchModal({
  open,
  conti = [],
  activeContoId = '',
  onClose,
  onSelect,
  onInvalidSelection,
  title = 'Ricerca conto',
  subtitle = 'F3 ricerca libera',
  placeholder = 'Cerca codice o descrizione',
  emptyMessage = 'Nessun conto trovato',
  selectionMode = 'registrazione',
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = useMemo(() => filterRegistrazioneConti(conti, query, { mode: 'search', limit: 600 }), [conti, query])
  const clampIndex = (value) => {
    if (!filtered.length) return 0
    return Math.max(0, Math.min(filtered.length - 1, value))
  }

  useEffect(() => {
    if (!open) return
    const initialIndex = Math.max(0, filtered.findIndex((item) => String(item?.id || '') === String(activeContoId || '')))
    setActiveIndex(initialIndex >= 0 ? initialIndex : 0)
    setNotice('')
    requestAnimationFrame(() => inputRef.current?.focus?.())
  }, [activeContoId, filtered, open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      const key = event.key
      if (key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => clampIndex(prev + 1))
        return
      }
      if (key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => clampIndex(prev - 1))
        return
      }
      if (key === 'Enter') {
        event.preventDefault()
        const selected = filtered[activeIndex]
        if (selected) {
          if (!canSelectConto(selected, selectionMode)) {
            const message = invalidSelectionMessage(selected, selectionMode)
            setNotice(message)
            onInvalidSelection?.(selected, message)
            return
          }
          setNotice('')
          onSelect?.(enrichSelectedConto(selected))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [activeIndex, filtered, onClose, onInvalidSelection, onSelect, open, selectionMode])

  useEffect(() => {
    const activeEl = listRef.current?.querySelector?.(`[data-search-index="${activeIndex}"]`)
    if (activeEl?.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 980, width: 'min(95vw, 980px)' }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">{title}</div>
          <div className="modal-sub">{subtitle}</div>
          <button type="button" className="modal-close" onClick={() => onClose?.()}>X</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: '.55rem' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
              setNotice('')
            }}
            placeholder={placeholder}
          />
          {notice ? (
            <div style={{ padding: '.45rem .55rem', borderRadius: 10, border: '1px solid rgba(255,208,92,.22)', background: 'rgba(255,208,92,.08)', color: 'rgba(255,224,160,.98)', fontSize: '.66rem' }}>
              {notice}
            </div>
          ) : null}
          {filtered.length ? (
            <div ref={listRef} style={{ maxHeight: '58vh', overflow: 'auto', display: 'grid', gap: '.3rem' }}>
              {filtered.map((conto, index) => {
                const active = index === activeIndex
                const hierarchy = resolveContoHierarchyView(conto)
                return (
                  <button
                    key={conto.id || conto.codice || resolveRegistrazioneContoLabel(conto)}
                    type="button"
                    className="btn-sec"
                    data-search-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onDoubleClick={() => {
                      if (!canSelectConto(conto, selectionMode)) {
                        const message = invalidSelectionMessage(conto, selectionMode)
                        setNotice(message)
                        onInvalidSelection?.(conto, message)
                        return
                      }
                      setNotice('')
                      onSelect?.(enrichSelectedConto(conto))
                    }}
                    onClick={() => {
                      if (!canSelectConto(conto, selectionMode)) {
                        const message = invalidSelectionMessage(conto, selectionMode)
                        setNotice(message)
                        onInvalidSelection?.(conto, message)
                        return
                      }
                      setNotice('')
                      onSelect?.(enrichSelectedConto(conto))
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '.55rem .7rem',
                      borderColor: active ? 'rgba(255,208,92,.6)' : undefined,
                      background: active ? 'rgba(255,208,92,.06)' : undefined,
                      boxShadow: active ? '0 0 0 1px rgba(255,208,92,.22)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.45rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
                        <div style={{ fontWeight: 700, paddingLeft: `${hierarchy.indentPx || 0}px` }}>{resolveRegistrazioneContoLabel(conto)}</div>
                        <span className={`bdg ${hierarchy.isSottoconto ? 'bdg-green' : hierarchy.isConto ? 'bdg-gold' : 'bdg-gray'}`} style={{ padding: '2px 6px', fontSize: '.54rem' }}>
                          {hierarchy.hierarchyLabel}
                        </span>
                      </div>
                      {active ? <span className="bdg bdg-gold" style={{ padding: '2px 6px', fontSize: '.54rem' }}>Attivo</span> : null}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>{resolveContoMeta(conto)}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: 12, border: '1px dashed rgba(136,169,204,.18)', color: 'rgba(188,226,226,.76)' }}>
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
