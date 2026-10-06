import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildRegistrazioneContoSelection,
  findRegistrazioneContoByPrefix,
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

function normalizeTypeaheadValue(value) {
  return String(value || '').toLowerCase().trim()
}

function renderHighlightedText(text, buffer) {
  const source = String(text || '')
  const query = normalizeTypeaheadValue(buffer)
  if (!query) return source

  const lower = source.toLowerCase()
  if (!lower.startsWith(query)) return source

  return (
    <>
      <span style={{ color: 'rgba(96,165,250,.95)' }}>{source.slice(0, query.length)}</span>
      <span>{source.slice(query.length)}</span>
    </>
  )
}

function resolvePrimaryLabel(item) {
  return String(resolveRegistrazioneContoLabel(item) || item?.codice || item?.code || item?.sigla || item?.id || '').trim()
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

export function RegistrazioneAccountPickerModal({
  open,
  conti = [],
  activeContoId = '',
  onClose,
  onSelect,
  onInvalidSelection,
  title = 'Piano dei conti',
  subtitle = 'F2 selezione rapida',
  introText = 'Digita codice o descrizione per salto rapido. Frecce, Invio, ESC e doppio click attivi.',
  emptyMessage = 'Piano dei conti non caricato',
  bufferLabel = 'Buffer',
  selectionMode = 'registrazione',
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [typeBuffer, setTypeBuffer] = useState('')
  const [notice, setNotice] = useState('')
  const timerRef = useRef(null)
  const listRef = useRef(null)

  const items = useMemo(() => (Array.isArray(conti) ? conti : []), [conti])
  const clampIndex = (value) => {
    if (!items.length) return 0
    return Math.max(0, Math.min(items.length - 1, value))
  }

  useEffect(() => {
    if (!open) return
    const initialIndex = Math.max(0, items.findIndex((item) => String(item?.id || '') === String(activeContoId || '')))
    setActiveIndex(initialIndex >= 0 ? initialIndex : 0)
    setTypeBuffer('')
    setNotice('')
    requestAnimationFrame(() => {
      const activeEl = listRef.current?.querySelector?.('[data-active-item="true"]')
      if (activeEl?.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' })
    })
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeContoId, items, open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      const key = event.key
      if (event.ctrlKey || event.metaKey || event.altKey) {
        if (key === 'Escape') {
          event.preventDefault()
          onClose?.()
        }
        return
      }
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
        setTypeBuffer('')
        if (timerRef.current) clearTimeout(timerRef.current)
        const selected = items[activeIndex]
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
        return
      }
      if (key === 'Backspace') {
        event.preventDefault()
        const nextBuffer = typeBuffer.slice(0, -1)
        setTypeBuffer(nextBuffer)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setTypeBuffer(''), 5000)
        const match = findRegistrazioneContoByPrefix(items, nextBuffer)
        if (match) {
          const index = items.findIndex((item) => String(item?.id || '') === String(match?.id || ''))
          if (index >= 0) setActiveIndex(index)
        }
        return
      }
      if (/^[\w\sàèéìòùÀÈÉÌÒÙ.-]$/.test(key)) {
        event.preventDefault()
        const nextBuffer = `${typeBuffer}${key}`.replace(/\s+/g, ' ').trim()
        if (!nextBuffer) return
        setTypeBuffer(nextBuffer)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setTypeBuffer(''), 5000)
        const match = findRegistrazioneContoByPrefix(items, nextBuffer)
        if (match) {
          const index = items.findIndex((item) => String(item?.id || '') === String(match?.id || ''))
          if (index >= 0) setActiveIndex(index)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [activeIndex, items, onClose, onInvalidSelection, onSelect, open, selectionMode, typeBuffer])

  useEffect(() => {
    const activeEl = listRef.current?.querySelector?.(`[data-picker-index="${activeIndex}"]`)
    if (activeEl?.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 920, width: 'min(94vw, 920px)' }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">{title}</div>
          <div className="modal-sub">{subtitle}</div>
          <button type="button" className="modal-close" onClick={() => onClose?.()}>X</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: '.55rem' }}>
          <div style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.74)' }}>{introText}</div>
          {notice ? (
            <div style={{ padding: '.45rem .55rem', borderRadius: 10, border: '1px solid rgba(255,208,92,.22)', background: 'rgba(255,208,92,.08)', color: 'rgba(255,224,160,.98)', fontSize: '.66rem' }}>
              {notice}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="bdg bdg-blue" style={{ minHeight: 20, padding: '2px 7px', fontSize: '.54rem' }}>
              {bufferLabel} {typeBuffer || '—'}
            </span>
          </div>
          {items.length ? (
            <div ref={listRef} style={{ maxHeight: '62vh', overflow: 'auto', display: 'grid', gap: '.3rem' }}>
              {items.map((conto, index) => {
                const active = index === activeIndex
                const hierarchy = resolveContoHierarchyView(conto)
                return (
                  <button
                    key={conto.id || conto.codice || resolveRegistrazioneContoLabel(conto)}
                    type="button"
                    className="btn-sec"
                    data-picker-index={index}
                    data-active-item={active ? 'true' : 'false'}
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
                      borderColor: active ? 'rgba(96,165,250,.95)' : undefined,
                      background: active ? 'rgba(96,165,250,.09)' : undefined,
                      boxShadow: active ? '0 0 0 1px rgba(96,165,250,.28)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.45rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', minWidth: 0 }}>
                        <div style={{ fontWeight: 700, paddingLeft: `${hierarchy.indentPx || 0}px` }}>{renderHighlightedText(resolvePrimaryLabel(conto), typeBuffer)}</div>
                        <span className={`bdg ${hierarchy.isSottoconto ? 'bdg-green' : hierarchy.isConto ? 'bdg-gold' : 'bdg-gray'}`} style={{ padding: '2px 6px', fontSize: '.54rem' }}>
                          {hierarchy.hierarchyLabel}
                        </span>
                      </div>
                      {active ? <span className="bdg bdg-blue" style={{ padding: '2px 6px', fontSize: '.54rem' }}>Attivo</span> : null}
                    </div>
                    <div style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.72)', marginTop: '.08rem' }}>
                      {renderHighlightedText(resolveRegistrazioneContoLabel(conto), typeBuffer)}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>{resolveContoMeta(conto)}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: 12, border: '1px dashed rgba(136,169,204,.18)', color: 'rgba(188,204,226,.76)' }}>
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
