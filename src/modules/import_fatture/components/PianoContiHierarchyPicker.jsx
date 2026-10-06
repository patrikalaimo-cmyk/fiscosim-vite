import { useMemo, useState, useCallback, useEffect } from 'react'

/** Stessa logica di costruzione albero di `PianoContiView` in AnagraficheContabiliView.jsx */
function buildPianoContiTree(filterRows) {
  const roots = []
  const getParentCode = (codice) => {
    if (!codice) return null
    const parts = codice.trim().split(/\s+/)
    if (parts.length <= 1) return null
    return parts.slice(0, -1).join(' ')
  }
  const map = {}
  const valid = filterRows.filter((c) => c?.codice)
  for (const c of valid) map[c.codice.trim()] = { ...c, codice: c.codice.trim(), children: [] }
  for (const c of valid) {
    let par = getParentCode(c.codice.trim())
    while (par && !map[par]) {
      const parParts = par.split(' ')
      const lvl = parParts.length
      map[par] = { codice: par, descrizione: `[${par}]`, livello: lvl, children: [], _placeholder: true }
      par = getParentCode(par)
    }
  }
  for (const key of Object.keys(map)) {
    const node = map[key]
    const par = getParentCode(key)
    if (par && map[par]) map[par].children.push(node)
    else roots.push(node)
  }
  const sortChildren = (node) => {
    node.children.sort((a, b) => a.codice.localeCompare(b.codice, undefined, { numeric: true }))
    node.children.forEach(sortChildren)
  }
  roots.sort((a, b) => a.codice.localeCompare(b.codice, undefined, { numeric: true }))
  roots.forEach(sortChildren)
  return roots
}

function normSearchToken(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function contoHaystack(conto) {
  return normSearchToken([conto?.codice, conto?.descrizione, conto?.nome].filter(Boolean).join(' '))
}

function filterPianoContiForInlineSearch(pianoConti, query, { max = 32, includeIva = false } = {}) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const raw = String(query || '').trim()
  const tokens = raw ? normSearchToken(raw).split(/\s+/).filter(Boolean) : []
  const usable = list.filter((c) => c && (includeIva || !c.is_iva) && Number(c.livello || 0) >= 3)
  if (!tokens.length) return []
  const ranked = usable
    .map((c) => {
      const h = contoHaystack(c)
      if (!tokens.every((t) => h.includes(t))) return null
      let score = tokens.length
      const desc = normSearchToken(c.descrizione || c.nome || '')
      for (const t of tokens) {
        if (desc.includes(t)) score += 3
      }
      return { c, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.c.codice || '').localeCompare(String(b.c.codice || ''), 'it'))
  return ranked.slice(0, max).map((x) => x.c)
}

function isContoSelectable(node, { includeIva = false } = {}) {
  return (
    node &&
    !node._placeholder &&
    (includeIva || !node.is_iva) &&
    Number(node.livello || 0) >= 3 &&
    node.id != null
  )
}

const PAGE_SIZE = 120

/**
 * Modale selettore: con ricerca attiva → lista flat (match rapidi); senza ricerca → albero a cascata come Piano dei conti.
 */
export function PianoContiHierarchyPicker({ pianoConti, searchQuery, onSelect, includeIva = false }) {
  const q = String(searchQuery || '').trim()
  const filterRows = useMemo(
    () => (Array.isArray(pianoConti) ? pianoConti : []).filter((row) => row?.codice),
    [pianoConti],
  )

  const tree = useMemo(() => buildPianoContiTree(filterRows), [filterRows])

  const flatMatches = useMemo(
    () => (q ? filterPianoContiForInlineSearch(pianoConti, q, { max: 500, includeIva }) : []),
    [pianoConti, q, includeIva],
  )

  const [open, setOpen] = useState(() => new Set())
  const [nodePage, setNodePage] = useState({})

  useEffect(() => {
    if (q) return
    setOpen((prev) => {
      if (prev.size > 0) return prev
      const next = new Set()
      tree.forEach((n) => next.add(n.codice))
      return next
    })
  }, [tree, q])

  const toggleOpen = useCallback((codice) => {
    setOpen((p) => {
      const n = new Set(p)
      if (n.has(codice)) n.delete(codice)
      else n.add(codice)
      return n
    })
  }, [])

  const expandAll = useCallback(() => {
    const s = new Set()
    filterRows.forEach((c) => {
      if (Number(c.livello || 0) < 4 && c.codice) s.add(c.codice.trim())
    })
    setOpen(s)
  }, [filterRows])

  const collapseAll = useCallback(() => {
    setOpen(new Set())
    setNodePage({})
  }, [])

  const renderNode = (node, depth = 0) => {
    const hasChildren = node.children?.length > 0
    const isOpen = open.has(node.codice)
    const currentPage = nodePage[node.codice] || 1
    const visibleChildren =
      hasChildren && isOpen ? node.children.slice(0, currentPage * PAGE_SIZE) : []
    const hasMore = hasChildren && isOpen && node.children.length > currentPage * PAGE_SIZE
    const selectable = isContoSelectable(node, { includeIva })
    const indent = depth * 18
    const lvlColors = ['rgba(212, 165, 32, 0.95)', 'rgba(100, 180, 255, 0.9)', 'var(--tx)', 'var(--mu)']

    return (
      <div key={node.codice}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.35rem',
            padding: `.28rem .5rem .28rem ${indent + 6}px`,
            borderBottom: '1px solid rgba(33, 40, 58, 0.45)',
            background: 'transparent',
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggleOpen(node.codice)}
              style={{
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: 'none',
                borderRadius: 4,
                background: 'rgba(255,255,255,.06)',
                color: 'var(--mu)',
                fontSize: '.65rem',
                cursor: 'pointer',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform .15s',
              }}
            >
              ▶
            </button>
          ) : (
            <div style={{ width: 22, flexShrink: 0 }} />
          )}
          <button
            type="button"
            disabled={!selectable}
            onClick={() => selectable && onSelect(node)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '.45rem',
              textAlign: 'left',
              border: 'none',
              background: selectable ? 'rgba(255,255,255,.04)' : 'transparent',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: selectable ? 'pointer' : 'default',
              opacity: selectable ? 1 : 0.92,
            }}
          >
            <code
              style={{
                fontSize: '.68rem',
                color: lvlColors[Math.min(depth, 3)] || 'var(--mu)',
                minWidth: depth === 0 ? 36 : depth === 1 ? 52 : 68,
                flexShrink: 0,
              }}
            >
              {node.codice}
            </code>
            <span
              style={{
                flex: 1,
                fontSize: depth < 2 ? '.78rem' : '.72rem',
                fontWeight: depth < 2 ? 600 : 400,
                color: depth < 2 ? 'rgba(230,240,252,.95)' : 'var(--mu)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.descrizione || node.nome || '—'}
            </span>
            {selectable ? (
              <span style={{ fontSize: '.58rem', color: 'var(--cy)', flexShrink: 0 }}>Seleziona</span>
            ) : null}
          </button>
        </div>
        {isOpen && hasChildren && visibleChildren.map((child) => renderNode(child, depth + 1))}
        {hasMore ? (
          <button
            type="button"
            onClick={() =>
              setNodePage((p) => ({
                ...p,
                [node.codice]: (p[node.codice] || 1) + 1,
              }))
            }
            style={{
              display: 'block',
              width: '100%',
              padding: '.35rem .75rem',
              fontSize: '.65rem',
              color: 'var(--cy)',
              border: 'none',
              borderBottom: '1px solid rgba(33, 40, 58, 0.35)',
              background: 'rgba(78, 142, 247, 0.06)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ↓ Altri sottoconti ({node.children.length - visibleChildren.length} rimasti)…
          </button>
        ) : null}
      </div>
    )
  }

  if (q) {
    return (
      <>
        {flatMatches.length === 0 ? (
          <div style={{ padding: '12px 10px', fontSize: '.68rem', color: 'var(--mu)' }}>
            Nessun conto corrispondente alla ricerca.
          </div>
        ) : null}
        {flatMatches.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              marginBottom: 4,
              fontSize: '.72rem',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,.08)',
              background: 'rgba(255,255,255,.04)',
              color: 'rgba(230,240,252,.96)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700 }}>{p.descrizione || p.nome || p.codice}</div>
            <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: 4 }}>{p.codice}</div>
          </button>
        ))}
      </>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '.5rem',
          marginBottom: 8,
          fontSize: '.62rem',
          color: 'var(--mu)',
        }}
      >
        <span>Struttura del piano (come in Anagrafiche contabili)</span>
        <button
          type="button"
          onClick={expandAll}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--cy)',
            cursor: 'pointer',
            padding: 0,
            fontSize: '.62rem',
            textDecoration: 'underline',
          }}
        >
          Espandi tutto
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={collapseAll}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--cy)',
            cursor: 'pointer',
            padding: 0,
            fontSize: '.62rem',
            textDecoration: 'underline',
          }}
        >
          Comprimi
        </button>
      </div>
      <div style={{ border: '1px solid rgba(124, 157, 202, 0.25)', borderRadius: 8, overflow: 'hidden' }}>
        {tree.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '.68rem', color: 'var(--mu)' }}>Nessun conto caricato.</div>
        ) : (
          tree.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  )
}
