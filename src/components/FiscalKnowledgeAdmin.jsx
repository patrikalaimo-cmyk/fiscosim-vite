import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { FISCAL_KNOWLEDGE_PANEL_SHORTCUT_LABEL, fiscalProposalSnoozeKey } from '../shared/constants'

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.72)',
  zIndex: 12000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
}

const MODAL_STYLE = {
  background: 'var(--s1)',
  border: '1px solid var(--bd)',
  borderRadius: 12,
  maxWidth: 720,
  width: '100%',
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,.45)',
}

const MODAL_WIDE = { ...MODAL_STYLE, maxWidth: 960 }

/**
 * Modale primo contatto: nessun "No", solo Sì o Proponi dopo (ripresenta al prossimo accesso).
 */
export function FiscalKnowledgeProposalIntroModal({ batch, onLater, onReview, onClose }) {
  if (!batch) return null
  return (
    <div style={OVERLAY_STYLE} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={MODAL_STYLE} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr" style={{ borderBottom: '1px solid var(--bd)', padding: '.85rem 1rem' }}>
          <div className="modal-title">Aggiornamenti regole IA</div>
          <button type="button" className="modal-close" onClick={onLater} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div style={{ padding: '1.25rem 1rem', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 1rem', lineHeight: 1.55, fontSize: '.92rem' }}>
            Sono stati trovati aggiornamenti alle <strong>regole nascoste IA</strong> (verifica fonti / nuove proposte da
            revisionare).
          </p>
          <p style={{ margin: '0 0 1rem', color: 'var(--mu)', fontSize: '.82rem', lineHeight: 1.5 }}>
            Puoi visualizzarli ora oppure proporre dopo: al prossimo accesso la notifica verrà mostrata di nuovo, finché la
            revisione non sarà completata e applicata.
          </p>
          {batch.title && (
            <div style={{ fontSize: '.8rem', color: 'var(--gold)', marginBottom: '1rem' }}>{batch.title}</div>
          )}
        </div>
        <div
          className="modal-foot"
          style={{
            display: 'flex',
            gap: '.75rem',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            padding: '.75rem 1rem',
            borderTop: '1px solid var(--bd)',
          }}
        >
          <button type="button" className="btn-sec" onClick={onLater}>
            Proponi dopo
          </button>
          <button type="button" className="btn" onClick={onReview}>
            Sì, visualizza
          </button>
        </div>
      </div>
    </div>
  )
}

function decisionLabel(d) {
  if (d === 'approve') return 'Confermato'
  if (d === 'reject') return 'Annullato'
  return '—'
}

/**
 * Revisione completa: ogni voce Conferma / Annulla; Applica solo se tutte decise.
 */
export function FiscalKnowledgeProposalReviewModal({ batchId, utente, onClose, onApplied }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [batch, setBatch] = useState(null)
  const [items, setItems] = useState([])
  const [decisions, setDecisions] = useState({})

  const load = useCallback(async () => {
    if (!batchId) return
    setLoading(true)
    setErr('')
    try {
      const b = await sb.from('fiscal_knowledge_proposals').select('*').eq('id', batchId).maybeSingle()
      if (b.error) throw new Error(b.error.message)
      setBatch(b.data)
      const it = await sb
        .from('fiscal_knowledge_proposal_items')
        .select('*')
        .eq('batch_id', batchId)
        .order('sort_order', { ascending: true })
      if (it.error) throw new Error(it.error.message)
      const list = it.data || []
      setItems(list)
      if (list.length) {
        const ids = list.map((r) => r.id)
        const dec = await sb.from('fiscal_knowledge_proposal_decisions').select('*').in('proposal_item_id', ids)
        if (dec.error) throw new Error(dec.error.message)
        const map = {}
        for (const r of dec.data || []) map[r.proposal_item_id] = r.decision
        setDecisions(map)
      } else setDecisions({})
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => {
    load()
  }, [load])

  const setDecision = async (itemId, decision) => {
    if (!utente?.id) {
      setErr('Utente non valido: impossibile salvare la decisione.')
      return
    }
    setErr('')
    setDecisions((prev) => ({ ...prev, [itemId]: decision }))
    const row = {
      proposal_item_id: itemId,
      decision,
      updated_by_user_id: utente.id,
      updated_at: new Date().toISOString(),
    }
    const up = await sb.from('fiscal_knowledge_proposal_decisions').upsert(row, { onConflict: 'proposal_item_id' })
    if (up.error) {
      setErr(up.error.message)
      return
    }
    if (batch?.status === 'pending') {
      await sb.from('fiscal_knowledge_proposals').update({ status: 'in_review' }).eq('id', batchId)
      setBatch((prev) => (prev ? { ...prev, status: 'in_review' } : prev))
    }
  }

  const allDecided = items.length > 0 && items.every((it) => decisions[it.id] === 'approve' || decisions[it.id] === 'reject')
  const pendingCount = items.filter((it) => !decisions[it.id]).length

  const applyBatch = async () => {
    if (!allDecided || !utente?.id) return
    setSaving(true)
    setErr('')
    try {
      for (const item of items) {
        const d = decisions[item.id]
        if (d !== 'approve') continue
        if (item.proposed_action === 'add') {
          const ins = await sb.from('fiscal_knowledge').insert([
            {
              categoria: item.categoria,
              chiave: item.chiave,
              valore: item.valore,
              contesto: item.contesto,
              valido_dal: item.valido_dal,
              valido_al: item.valido_al,
              descrizione: item.descrizione,
              metadata: item.metadata || {},
              attivo: true,
            },
          ])
          if (ins.error) throw new Error(ins.error.message)
        } else if (item.proposed_action === 'update' && item.target_fiscal_knowledge_id) {
          const patch = {
            categoria: item.categoria,
            chiave: item.chiave,
            valore: item.valore,
            contesto: item.contesto,
            valido_dal: item.valido_dal,
            valido_al: item.valido_al,
            descrizione: item.descrizione,
            metadata: item.metadata || {},
            updated_at: new Date().toISOString(),
          }
          const u = await sb.from('fiscal_knowledge').update(patch).eq('id', item.target_fiscal_knowledge_id)
          if (u.error) throw new Error(u.error.message)
        } else if (item.proposed_action === 'deactivate' && item.target_fiscal_knowledge_id) {
          const u = await sb
            .from('fiscal_knowledge')
            .update({ attivo: false, updated_at: new Date().toISOString() })
            .eq('id', item.target_fiscal_knowledge_id)
          if (u.error) throw new Error(u.error.message)
        }
      }
      const fin = await sb
        .from('fiscal_knowledge_proposals')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          applied_by_user_id: utente.id,
        })
        .eq('id', batchId)
      if (fin.error) throw new Error(fin.error.message)
      onApplied?.()
      onClose?.()
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={OVERLAY_STYLE} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={MODAL_WIDE} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr" style={{ borderBottom: '1px solid var(--bd)', padding: '.85rem 1rem' }}>
          <div className="modal-title">Revisione aggiornamenti regole IA</div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {loading && <div className="loading">⏳ Caricamento…</div>}
          {!loading && err && <div className="alert alert-err" style={{ marginBottom: '.75rem' }}>{err}</div>}
          {!loading && !err && items.length === 0 && <p style={{ color: 'var(--mu)' }}>Nessuna voce in questo batch.</p>}
          {!loading &&
            items.map((it) => (
              <div
                key={it.id}
                style={{
                  border: '1px solid var(--bd)',
                  borderRadius: 10,
                  padding: '.85rem',
                  marginBottom: '.75rem',
                  background: 'var(--s2)',
                }}
              >
                <div style={{ fontSize: '.72rem', color: 'var(--gold)', marginBottom: '.35rem' }}>
                  [{it.categoria}] {it.chiave} · {it.proposed_action}
                </div>
                <div style={{ fontSize: '.88rem', marginBottom: '.5rem', whiteSpace: 'pre-wrap' }}>{it.valore}</div>
                {it.descrizione && (
                  <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginBottom: '.5rem' }}>{it.descrizione}</div>
                )}
                {it.source_url && (
                  <a href={it.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.76rem' }}>
                    {it.source_label || it.source_url}
                  </a>
                )}
                <div style={{ display: 'flex', gap: '.75rem', marginTop: '.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '.78rem', color: 'var(--mu)' }}>Decisione:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.82rem' }}>
                    <input
                      type="radio"
                      name={`dec-${it.id}`}
                      checked={decisions[it.id] === 'approve'}
                      onChange={() => setDecision(it.id, 'approve')}
                    />
                    Conferma
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.82rem' }}>
                    <input
                      type="radio"
                      name={`dec-${it.id}`}
                      checked={decisions[it.id] === 'reject'}
                      onChange={() => setDecision(it.id, 'reject')}
                    />
                    Annulla
                  </label>
                  <span style={{ fontSize: '.75rem', color: 'var(--mu)', marginLeft: '.5rem' }}>
                    Stato: {decisionLabel(decisions[it.id])}
                  </span>
                </div>
              </div>
            ))}
          {!loading && items.length > 0 && (
            <p style={{ fontSize: '.8rem', color: pendingCount ? '#e8a045' : 'var(--gr)', marginTop: '.5rem' }}>
              {pendingCount
                ? `Devi decidere tutte le voci (${pendingCount} senza risposta). Il pulsante Applica resta disabilitato.`
                : 'Tutte le voci hanno una decisione. Puoi modificare le scelte finché non applichi.'}
            </p>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '.75rem',
            flexWrap: 'wrap',
            padding: '.75rem 1rem',
            borderTop: '1px solid var(--bd)',
          }}
        >
          <button type="button" className="btn-sec" onClick={onClose}>
            Chiudi (continua dopo)
          </button>
          <button type="button" className="btn" disabled={!allDecided || saving} onClick={applyBatch}>
            {saving ? '⏳ Applico…' : 'Applica definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Pannello: elenco fiscal_knowledge + avvio scan placeholder + link a revisione se batch aperto.
 */
export function FiscalKnowledgeRulesPanelModal({ open, onClose, utente, pendingBatchId, onOpenReview, onScanDone }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const q = await sb.from('fiscal_knowledge').select('*').eq('attivo', true).order('categoria').limit(800)
      if (!cancelled) {
        if (q.error) setMsg(q.error.message)
        else setRows(q.data || [])
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const runScan = async () => {
    setScanning(true)
    setMsg('')
    try {
      const res = await fetch('/api/fiscal-knowledge-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Scan fallito')
      setMsg(`Batch creato (${j.itemsCount || 0} voci). Chiudi e ricarica o attendi la notifica al prossimo accesso.`)
      onScanDone?.(j.batchId)
    } catch (e) {
      setMsg(e?.message || String(e))
    } finally {
      setScanning(false)
    }
  }

  if (!open) return null

  const f = filter.trim().toLowerCase()
  const filtered = f
    ? rows.filter(
        (r) =>
          String(r.categoria || '')
            .toLowerCase()
            .includes(f) ||
          String(r.chiave || '')
            .toLowerCase()
            .includes(f) ||
          String(r.valore || '')
            .toLowerCase()
            .includes(f)
      )
    : rows

  return (
    <div style={OVERLAY_STYLE} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_WIDE, maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr" style={{ borderBottom: '1px solid var(--bd)', padding: '.85rem 1rem' }}>
          <div className="modal-title">Regole IA — database fiscal_knowledge</div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--bd)', display: 'flex', flexWrap: 'wrap', gap: '.65rem', alignItems: 'center' }}>
          <input
            placeholder="Filtra categoria, chiave, valore…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              borderRadius: 8,
              padding: '.45rem .65rem',
              color: 'var(--tx)',
              fontSize: '.82rem',
            }}
          />
          {pendingBatchId && (
            <button type="button" className="btn-sec" onClick={() => onOpenReview?.(pendingBatchId)}>
              Apri revisione batch in sospeso
            </button>
          )}
          <button type="button" className="btn" disabled={scanning} onClick={runScan}>
            {scanning ? '⏳…' : 'Nuova verifica fonti (placeholder)'}
          </button>
        </div>
        {msg && (
          <div className="alert alert-info" style={{ margin: '.5rem 1rem 0' }}>
            {msg}
          </div>
        )}
        <div style={{ padding: '.75rem 1rem', overflowY: 'auto', flex: 1, fontSize: '.78rem' }}>
          {loading && <div>⏳</div>}
          {!loading &&
            filtered.map((r) => (
              <div
                key={r.id}
                style={{
                  borderBottom: '1px solid var(--bd2)',
                  padding: '.5rem 0',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: 'var(--gold)' }}>
                  [{r.categoria}] {r.chiave}
                </strong>
                <div style={{ color: 'var(--tx)', marginTop: '.2rem' }}>{r.valore}</div>
                {r.descrizione && <div style={{ color: 'var(--mu)', marginTop: '.2rem' }}>{r.descrizione}</div>}
              </div>
            ))}
        </div>
        <div style={{ padding: '.5rem 1rem', borderTop: '1px solid var(--bd)', fontSize: '.68rem', color: 'var(--mu)' }}>
          Utente: {utente?.email || utente?.nome || '—'} · Le modifiche alle proposte avvengono dalla revisione batch.
        </div>
      </div>
    </div>
  )
}

/**
 * Hook: batch pending, intro modale, shortcut, snooze sessione.
 */
export function useFiscalKnowledgeAdmin({ utente, ruolo, panelOpen, setPanelOpen }) {
  const allowed = utente && (ruolo === 'owner' || ruolo === 'admin')
  const [pendingBatch, setPendingBatch] = useState(null)
  const [introOpen, setIntroOpen] = useState(false)
  const [reviewBatchId, setReviewBatchId] = useState(null)

  const fetchPending = useCallback(async () => {
    if (!allowed) {
      setPendingBatch(null)
      return
    }
    const q = await sb
      .from('fiscal_knowledge_proposals')
      .select('id,title,status,created_at')
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (q.error) {
      console.warn('[fiscal proposals]', q.error.message)
      setPendingBatch(null)
      return
    }
    setPendingBatch(q.data || null)
  }, [allowed])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  useEffect(() => {
    if (!allowed || !pendingBatch?.id) {
      setIntroOpen(false)
      return
    }
    try {
      if (sessionStorage.getItem(fiscalProposalSnoozeKey(pendingBatch.id))) {
        setIntroOpen(false)
        return
      }
    } catch {
      /* ignore */
    }
    setIntroOpen(true)
  }, [allowed, pendingBatch?.id])

  useEffect(() => {
    if (!allowed) return
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault()
        setPanelOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allowed, setPanelOpen])

  const onIntroLater = () => {
    if (pendingBatch?.id) {
      try {
        sessionStorage.setItem(fiscalProposalSnoozeKey(pendingBatch.id), '1')
      } catch {
        /* ignore */
      }
    }
    setIntroOpen(false)
  }

  const onIntroReview = () => {
    if (pendingBatch?.id) {
      setReviewBatchId(pendingBatch.id)
      setIntroOpen(false)
    }
  }

  const closeReview = () => {
    setReviewBatchId(null)
    fetchPending()
  }

  const onApplied = () => {
    fetchPending()
    setReviewBatchId(null)
    setIntroOpen(false)
  }

  return {
    allowed,
    pendingBatch,
    introOpen,
    reviewBatchId,
    setReviewBatchId,
    setPanelOpen,
    fetchPending,
    onIntroLater,
    onIntroReview,
    closeReview,
    onApplied,
    introModal:
      allowed && introOpen && pendingBatch ? (
        <FiscalKnowledgeProposalIntroModal
          batch={pendingBatch}
          onLater={onIntroLater}
          onReview={onIntroReview}
          onClose={onIntroLater}
        />
      ) : null,
    reviewModal:
      allowed && reviewBatchId ? (
        <FiscalKnowledgeProposalReviewModal batchId={reviewBatchId} utente={utente} onClose={closeReview} onApplied={onApplied} />
      ) : null,
    rulesPanel: allowed ? (
      <FiscalKnowledgeRulesPanelModal
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        utente={utente}
        pendingBatchId={pendingBatch?.id}
        onOpenReview={(id) => {
          setReviewBatchId(id)
          setPanelOpen(false)
        }}
        onScanDone={() => fetchPending()}
      />
    ) : null,
    shortcutLabel: FISCAL_KNOWLEDGE_PANEL_SHORTCUT_LABEL,
  }
}
