import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function useAnchorRect(anchorRef, open) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!open) return
    const el = anchorRef.current
    if (!el) return

    const read = () => {
      const r = el.getBoundingClientRect()
      setRect({
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      })
    }

    read()
    const onScroll = () => read()
    const onResize = () => read()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchorRef, open])

  return rect
}

export function BaseCombobox({
  value,
  onChange,
  options,
  getOptionId = (o) => o?.id,
  getOptionLabel = (o) => o?.label ?? o?.name ?? o?.descrizione ?? o?.codice ?? String(getOptionId(o) ?? ''),
  placeholder = 'Seleziona...',
  disabled = false,
  searchable = true,
  maxItems = 120,
  menuMaxHeight = 260,
  className = '',
}) {
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const anchorRect = useAnchorRect(wrapRef, open)

  const selected = useMemo(() => {
    const id = String(value ?? '')
    return (options || []).find((o) => String(getOptionId(o) ?? '') === id) || null
  }, [value, options, getOptionId])

  const display = useMemo(() => (selected ? String(getOptionLabel(selected) || '').trim() : ''), [selected, getOptionLabel])

  const filtered = useMemo(() => {
    const list = Array.isArray(options) ? options : []
    const query = String(q || '').trim().toLowerCase()
    if (!open || !searchable || !query) return list.slice(0, maxItems)
    return list
      .filter((o) => String(getOptionLabel(o) || '').toLowerCase().includes(query))
      .slice(0, maxItems)
  }, [options, q, open, searchable, maxItems, getOptionLabel])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQ('')
    queueMicrotask(() => inputRef.current?.focus?.())
  }, [open])

  const menu =
    open && anchorRect
      ? createPortal(
          <div
            className="dd-menu"
            style={{
              position: 'fixed',
              zIndex: 9999,
              left: clamp(anchorRect.left, 8, window.innerWidth - 16),
              top: clamp(anchorRect.bottom + 6, 8, window.innerHeight - 16),
              width: clamp(anchorRect.width, 220, window.innerWidth - 16),
              maxHeight: menuMaxHeight,
              overflow: 'auto',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {filtered.length ? (
              filtered.map((o) => {
                const id = String(getOptionId(o) ?? '')
                const isSel = String(value ?? '') === id
                return (
                  <div
                    key={id || getOptionLabel(o)}
                    className={`dd-opt${isSel ? ' selected' : ''}`}
                    role="option"
                    aria-selected={isSel}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(id)
                      setOpen(false)
                    }}
                  >
                    {getOptionLabel(o)}
                  </div>
                )
              })
            ) : (
              <div className="dd-empty">Nessun risultato</div>
            )}
          </div>,
          document.body
        )
      : null

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative', minWidth: 0 }}>
      <input
        ref={inputRef}
        className="base-input"
        value={open && searchable ? q : display}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!open || !searchable}
        onFocus={() => {
          if (disabled) return
          setOpen(true)
        }}
        onClick={() => {
          if (disabled) return
          setOpen(true)
        }}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
      />
      {menu}
    </div>
  )
}

