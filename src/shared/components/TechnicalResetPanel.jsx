import { useEffect, useMemo, useState } from 'react'

import { puoGestireUtenti } from '../utils/permissions.js'

const ACTION_META = {
  reset_document_claims: {
    label: 'Reset claim/lock documenti',
    touches: 'locked_by, locked_at, workflow_status su documenti_contabilita',
    avoids: 'Non tocca prima_nota, prima_nota_righe, partitario o contabilità valida',
    supportsDocument: true,
    supportsCompany: true,
    strongConfirm: false,
  },
  reset_import_queue: {
    label: 'Reset coda import',
    touches: 'Normalizza solo staging tecnico: stato, processato_at, modulo_destinazione, cliente_match_type orfano',
    avoids: 'Non tocca documenti_contabilita, prima_nota, prima_nota_righe o partitario',
    supportsDocument: false,
    supportsCompany: true,
    strongConfirm: false,
  },
  reset_document_workflow: {
    label: 'Reset workflow documento',
    touches: 'Solo workflow/lock/metadati tecnici del documento selezionato',
    avoids: 'Non sgancia prima_nota_id e non pulisce registered_at in v1',
    supportsDocument: true,
    supportsCompany: false,
    strongConfirm: true,
  },
}

function ResultBox({ result }) {
  if (!result) return null
  const tone =
    result.status === 'completed'
      ? 'alert-success'
      : result.status === 'preview'
        ? 'alert-info'
        : result.status === 'blocked'
          ? 'alert-warn'
          : result.status === 'error'
            ? 'alert-err'
            : 'alert-info'
  return (
    <div className={`alert ${tone}`} style={{ margin: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: '.25rem' }}>{result.summary || 'Operazione completata'}</div>
      <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
        Toccati {result.touchedCount || 0} · Bloccati {result.blockedCount || 0} · Saltati {result.skippedCount || 0}
      </div>
      {Array.isArray(result.notes) && result.notes.length > 0 && (
        <div style={{ marginTop: '.4rem', fontSize: '.74rem', display: 'grid', gap: '.2rem' }}>
          {result.notes.map((note, index) => <div key={`${index}-${note}`}>{note}</div>)}
        </div>
      )}
    </div>
  )
}

export function TechnicalResetPanel({
  ruolo,
  societaId = '',
  documentId = '',
  contextLabel = 'contesto corrente',
  onCompleted = null,
}) {
  const canSee = puoGestireUtenti(ruolo)
  const [open, setOpen] = useState(false)
  const [loadingAction, setLoadingAction] = useState('')
  const [results, setResults] = useState({})
  const [claimScope, setClaimScope] = useState(documentId ? 'document' : 'company')
  const [softConfirm, setSoftConfirm] = useState({})
  const [typedConfirm, setTypedConfirm] = useState('')

  useEffect(() => {
    setTypedConfirm('')
    setSoftConfirm({})
    setResults({})
    setClaimScope(documentId ? 'document' : 'company')
  }, [documentId, societaId])

  const availableActions = useMemo(() => {
    return Object.entries(ACTION_META).map(([action, meta]) => ({
      action,
      ...meta,
      canPreview:
        (meta.supportsCompany && societaId) ||
        (meta.supportsDocument && documentId),
    }))
  }, [documentId, societaId])

  if (!canSee) return null

  const buildPayload = (action, dryRun) => {
    if (action === 'reset_document_claims') {
      const scopeType = claimScope === 'document' && documentId ? 'document' : 'company'
      return {
        action,
        dryRun,
        scopeType,
        scopeId: scopeType === 'document' ? documentId : societaId,
        societaId,
      }
    }
    if (action === 'reset_import_queue') {
      return {
        action,
        dryRun,
        scopeType: 'company',
        scopeId: societaId,
        societaId,
      }
    }
    return {
      action,
      dryRun,
      scopeType: 'document',
      scopeId: documentId,
      societaId,
    }
  }

  const runAction = async (action, dryRun) => {
    setLoadingAction(`${action}:${dryRun ? 'preview' : 'execute'}`)
    try {
      const res = await fetch('/api/admin/reset-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(action, dryRun)),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.ok === false) throw new Error(json?.error || json?.message || res.statusText)
      setResults((prev) => ({ ...prev, [action]: json }))
      if (!dryRun) {
        setSoftConfirm({})
        setTypedConfirm('')
        setResults({ [action]: json })
        await onCompleted?.(json)
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [action]: {
          status: 'error',
          summary: error?.message || String(error),
          touchedCount: 0,
          blockedCount: 0,
          skippedCount: 0,
          notes: [],
        },
      }))
    } finally {
      setLoadingAction('')
    }
  }

  return (
    <div className="erp-filter-card" style={{ marginTop: '.75rem', borderStyle: 'dashed' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.84rem' }}>Strumenti tecnici reset</div>
          <div style={{ fontSize: '.74rem', color: 'var(--mu)' }}>
            Owner/Admin · debug sicuro per {contextLabel}
          </div>
        </div>
        <button type="button" className="btn-sec btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Nascondi' : 'Modalità tecnica'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '.85rem', display: 'grid', gap: '.75rem' }}>
          {availableActions.map((item) => {
            const result = results[item.action] || null
            const busyPreview = loadingAction === `${item.action}:preview`
            const busyExecute = loadingAction === `${item.action}:execute`
            const canExecuteSoft = Boolean(softConfirm[item.action])
            const canExecuteStrong = typedConfirm.trim().toUpperCase() === 'RESET'
            const canExecute = item.strongConfirm ? canExecuteStrong : canExecuteSoft
            return (
              <div key={item.action} className="card" style={{ padding: '.8rem .9rem', display: 'grid', gap: '.65rem' }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{item.label}</div>
                  <div style={{ fontSize: '.74rem', color: 'var(--mu)' }}>Tocca: {item.touches}</div>
                  <div style={{ fontSize: '.74rem', color: 'var(--mu)' }}>Non tocca: {item.avoids}</div>
                </div>

                {item.action === 'reset_document_claims' && item.supportsDocument && documentId && (
                  <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', fontSize: '.76rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                      <input
                        type="radio"
                        name="technical-reset-claim-scope"
                        checked={claimScope === 'document'}
                        onChange={() => setClaimScope('document')}
                      />
                      Documento selezionato
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                      <input
                        type="radio"
                        name="technical-reset-claim-scope"
                        checked={claimScope === 'company'}
                        onChange={() => setClaimScope('company')}
                      />
                      Società attiva
                    </label>
                  </div>
                )}

                {!item.canPreview && (
                  <div className="alert alert-warn" style={{ margin: 0 }}>
                    Scope non disponibile: seleziona una società o un documento idoneo.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-sec btn-sm"
                    disabled={!item.canPreview || busyPreview || busyExecute}
                    onClick={() => runAction(item.action, true)}
                  >
                    {busyPreview ? 'Preview...' : 'Preview dry-run'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!item.canPreview || !canExecute || busyPreview || busyExecute}
                    onClick={() => runAction(item.action, false)}
                  >
                    {busyExecute ? 'Esecuzione...' : 'Esegui reset'}
                  </button>
                </div>

                {item.strongConfirm ? (
                  <div style={{ display: 'grid', gap: '.35rem' }}>
                    <label style={{ fontSize: '.74rem', color: 'var(--mu)', fontWeight: 600 }}>
                      Conferma forte: digita <code>RESET</code>
                    </label>
                    <input
                      value={typedConfirm}
                      onChange={(e) => setTypedConfirm(e.target.value)}
                      placeholder="Digita RESET"
                    />
                  </div>
                ) : (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', fontSize: '.76rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(softConfirm[item.action])}
                      onChange={(e) => setSoftConfirm((prev) => ({ ...prev, [item.action]: e.target.checked }))}
                    />
                    Confermo di voler eseguire l’azione dopo la preview
                  </label>
                )}

                <ResultBox result={result} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
