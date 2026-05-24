import { fmtCurrency as fmt, fmtDate } from '../ui/formatters.js'
import { useEffect, useState } from 'react'

export function ScritturaDetailPanel({
  open = false,
  onClose,
  loading = false,
  error = '',
  successMessage = '',
  scrittura = null,
  righe = [],
  canEditHeader = false,
  onSaveHeader = null,
  savingHeader = false,
  onCheckDeleteGuards = null,
  checkingDeleteGuards = false,
  deleteGuards = null,
  operationContext = null,
  annulloPrepare = null,
  preparingAnnulla = false,
  onRunAnnullaRegistrazione = null,
  runningAnnullaRegistrazione = false,
  onDeleteScrittura = null,
  deletingScrittura = false,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({
    descrizione: '',
    data_documento: '',
    data_registrazione: '',
    numero_documento: '',
  })
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const isBusy = Boolean(savingHeader || checkingDeleteGuards || deletingScrittura || preparingAnnulla || runningAnnullaRegistrazione)

  useEffect(() => {
    setIsEditing(false)
    setDeleteConfirmText('')
    setForm({
      descrizione: String(scrittura?.descrizione || ''),
      data_documento: String(scrittura?.data_documento || '').slice(0, 10),
      data_registrazione: String(scrittura?.data_registrazione || '').slice(0, 10),
      numero_documento: String(scrittura?.numero_documento || ''),
    })
  }, [scrittura?.id])

  if (!open) return null

  return (
    <div className="overlay" onMouseDown={(e) => !isBusy && e.target === e.currentTarget && onClose?.()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980, width: 'min(96vw, 980px)' }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">
            Scrittura contabile
            {scrittura?.numero_registrazione ? ` #${scrittura.numero_registrazione}` : ''}
          </div>
          {canEditHeader && !loading && !error && scrittura?.id ? (
            <div style={{ marginLeft: 'auto', marginRight: '.5rem' }}>
              {isEditing ? (
                <>
                  <button
                    className="btn-sec"
                    style={{ marginRight: '.4rem' }}
                    onClick={() => {
                      setIsEditing(false)
                      setForm({
                        descrizione: String(scrittura?.descrizione || ''),
                        data_documento: String(scrittura?.data_documento || '').slice(0, 10),
                        data_registrazione: String(scrittura?.data_registrazione || '').slice(0, 10),
                        numero_documento: String(scrittura?.numero_documento || ''),
                      })
                    }}
                    disabled={isBusy}
                  >
                    Annulla
                  </button>
                  <button
                    className="btn"
                    onClick={() => onSaveHeader?.(scrittura.id, { ...form })}
                    disabled={isBusy}
                  >
                    {savingHeader ? 'Salvataggio…' : 'Salva header'}
                  </button>
                </>
              ) : (
                <button className="btn-sec" onClick={() => setIsEditing(true)} disabled={isBusy}>Modifica header</button>
              )}
            </div>
          ) : null}
          <button className="modal-close" onClick={() => onClose?.()} disabled={isBusy}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="empty"><div className="empty-t">Caricamento dettaglio…</div></div>
          ) : error ? (
            <div className="alert alert-warn">{error}</div>
          ) : !scrittura ? (
            <div className="empty"><div className="empty-s">Scrittura non trovata.</div></div>
          ) : (
            <>
              {successMessage ? (
                <div className="alert alert-success" style={{ marginBottom: '.9rem' }}>{successMessage}</div>
              ) : null}
              <div className="form-grid" style={{ marginBottom: '.9rem' }}>
                <div className="fg"><label>N° registrazione</label><div><strong>{scrittura.numero_registrazione || '—'}</strong></div></div>
                <div className="fg">
                  <label>Data registrazione</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={form.data_registrazione}
                      onChange={(e) => setForm((p) => ({ ...p, data_registrazione: e.target.value }))}
                      disabled={isBusy}
                    />
                  ) : <div>{scrittura.data_registrazione ? fmtDate(scrittura.data_registrazione) : '—'}</div>}
                </div>
                <div className="fg">
                  <label>Data documento</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={form.data_documento}
                      onChange={(e) => setForm((p) => ({ ...p, data_documento: e.target.value }))}
                      disabled={isBusy}
                    />
                  ) : <div>{scrittura.data_documento ? fmtDate(scrittura.data_documento) : '—'}</div>}
                </div>
                <div className="fg">
                  <label>N° documento</label>
                  {isEditing ? (
                    <input
                      value={form.numero_documento}
                      onChange={(e) => setForm((p) => ({ ...p, numero_documento: e.target.value }))}
                      placeholder="Numero documento"
                      disabled={isBusy}
                    />
                  ) : <div>{scrittura.numero_documento || '—'}</div>}
                </div>
                <div className="fg"><label>Causale</label><div>{scrittura.causale_codice || '—'}</div></div>
                <div className="fg"><label>Causale IVA</label><div>{scrittura.causale_iva_codice || '—'}</div></div>
                <div className="fg"><label>Controparte</label><div>{scrittura.cliente_fornitore_nome || '—'}</div></div>
                <div className="fg"><label>Stato</label><div><span className="bdg bdg-gray">{scrittura.stato || '—'}</span></div></div>
                <div className="fg full">
                  <label>Descrizione</label>
                  {isEditing ? (
                    <input
                      value={form.descrizione}
                      onChange={(e) => setForm((p) => ({ ...p, descrizione: e.target.value }))}
                      placeholder="Descrizione scrittura"
                      disabled={isBusy}
                    />
                  ) : <div>{scrittura.descrizione || '—'}</div>}
                </div>
              </div>

              {operationContext ? (
                <div className="card" style={{ marginBottom: '.9rem' }}>
                  <div className="card-hdr">
                    <div>
                      <div className="card-title">Modello operazione</div>
                      <div className="card-subtitle">Scrittura canonica e azioni consentite sul contesto attuale.</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '.86rem', color: 'var(--text)' }}>
                    <div style={{ marginBottom: '.3rem' }}>
                      <strong>Stato contesto:</strong> {operationContext?.isIsolated ? 'Scrittura isolata' : 'Scrittura collegata'}
                    </div>
                    <div style={{ marginBottom: '.3rem' }}>
                      <strong>Delete isolata:</strong> {operationContext?.actionModel?.canDeleteIsolated ? 'consentita' : 'bloccata'}
                    </div>
                    <div style={{ color: 'var(--mu)' }}>
                      {operationContext?.guidance || 'Verifica operativa non disponibile.'}
                    </div>
                  </div>
                </div>
              ) : null}

              {operationContext?.actionModel?.requiresAnnullaRegistrazione && !operationContext?.actionModel?.canDeleteIsolated ? (
                <div className="card" style={{ marginBottom: '.9rem' }}>
                  <div className="card-hdr">
                    <div>
                      <div className="card-title">Annulla registrazione collegata</div>
                      <div className="card-subtitle">Questa scrittura richiede annullo collegato, non delete isolata.</div>
                    </div>
                  </div>
                  {preparingAnnulla ? (
                    <div style={{ color: 'var(--mu)' }}>Preparazione impatti in corso…</div>
                  ) : !annulloPrepare ? (
                    <div style={{ color: 'var(--mu)' }}>Analisi annullo collegato non ancora disponibile.</div>
                  ) : (
                    <>
                      <div className={annulloPrepare?.canPrepare ? 'alert alert-info' : 'alert alert-warn'} style={{ margin: 0, marginBottom: '.65rem' }}>
                        {annulloPrepare?.canPrepare
                          ? 'Preparazione annullo disponibile (read-only).'
                          : 'Preparazione annullo non pronta: verifica motivi sotto.'}
                      </div>
                      <div style={{ fontSize: '.85rem', marginBottom: '.4rem' }}>
                        <strong>Prossima azione prevista:</strong> {annulloPrepare?.nextAction || 'annulla_registrazione_collegata'}
                      </div>
                      {(Array.isArray(annulloPrepare?.reasons) ? annulloPrepare.reasons : []).length > 0 ? (
                        <div style={{ marginBottom: '.5rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Motivi</div>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                            {(annulloPrepare.reasons || []).map((reason, idx) => (
                              <li key={`apr-${idx}`}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Checklist impatti</div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                          {(annulloPrepare?.impattiPrevisti || []).map((impact, idx) => (
                            <li key={`api-${idx}`}>{impact}</li>
                          ))}
                          {!annulloPrepare?.impattiPrevisti?.length ? <li>Nessun impatto specifico calcolato.</li> : null}
                        </ul>
                      </div>
                      {annulloPrepare?.canPrepare && annulloPrepare?.nextAction === 'annulla_registrazione_collegata' ? (
                        <div style={{ marginTop: '.7rem' }}>
                          <button
                            type="button"
                            className="btn-warn"
                            onClick={() => onRunAnnullaRegistrazione?.(scrittura?.id)}
                            disabled={isBusy || !scrittura?.id}
                          >
                            {runningAnnullaRegistrazione ? 'Annullamento collegato…' : 'Esegui annulla registrazione collegata'}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {onCheckDeleteGuards || onDeleteScrittura ? (
              <div className="card" style={{ marginBottom: '.9rem' }}>
                <div className="card-hdr" style={{ alignItems: 'center' }}>
                  <div>
                    <div className="card-title">Eliminazione controllata</div>
                    <div className="card-subtitle">Verifica read-only del perimetro di sicurezza.</div>
                  </div>
                  <button
                    className="btn-sec"
                    onClick={() => onCheckDeleteGuards?.(scrittura?.id)}
                    disabled={isBusy || !scrittura?.id}
                  >
                    {checkingDeleteGuards ? 'Verifica in corso…' : 'Verifica prerequisiti eliminazione'}
                  </button>
                </div>
                <div style={{ marginTop: '.6rem' }}>
                  {!deleteGuards ? (
                    <div style={{ color: 'var(--mu)' }}>Nessuna verifica eseguita. Esegui il pre-check prima di eliminare.</div>
                  ) : deleteGuards.canDelete ? (
                    <div className="alert alert-success" style={{ margin: 0 }}>
                      Pre-check OK: eliminazione consentita (nessun vincolo bloccante rilevato).
                    </div>
                  ) : (
                    <div className="alert alert-warn" style={{ margin: 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>
                        Eliminazione bloccata dal pre-check.
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {(Array.isArray(deleteGuards.reasons) ? deleteGuards.reasons : []).map((reason, idx) => (
                          <li key={`${reason}-${idx}`}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {deleteGuards?.canDelete ? (
                  <div style={{ marginTop: '.7rem', paddingTop: '.7rem', borderTop: '1px solid var(--line, #e5e5e5)' }}>
                    <div style={{ fontSize: '.82rem', color: 'var(--mu)', marginBottom: '.45rem' }}>
                      Conferma forte: digita <strong>ELIMINA</strong> per abilitare la cancellazione reale.
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Digita ELIMINA"
                        style={{ minWidth: 180 }}
                        disabled={isBusy}
                      />
                      <button
                        className="btn-warn"
                        onClick={() => onDeleteScrittura?.(scrittura?.id)}
                        disabled={isBusy || deleteConfirmText.trim().toUpperCase() !== 'ELIMINA'}
                      >
                        {deletingScrittura ? 'Eliminazione…' : 'Elimina scrittura'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="card-hdr">
                  <div>
                    <div className="card-title">Righe scrittura</div>
                    <div className="card-subtitle">{righe.length} righe contabili.</div>
                  </div>
                </div>
                <div style={{ overflow: 'auto' }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Riga</th>
                        <th>Conto</th>
                        <th>Descrizione riga</th>
                        <th className="tar">Dare</th>
                        <th className="tar">Avere</th>
                        <th>IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(righe || []).map((r) => (
                        <tr key={r.id}>
                          <td>{r.riga_numero || '—'}</td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{r.conto_codice || '—'}</div>
                            <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{r.conto_descrizione || '—'}</div>
                          </td>
                          <td>{r.descrizione_riga || '—'}</td>
                          <td className="tar">{fmt(r.importo_dare || 0)}</td>
                          <td className="tar">{fmt(r.importo_avere || 0)}</td>
                          <td>{r.causale_iva_codice || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 800, background: 'var(--s2, #f4f4f4)' }}>
                        <td colSpan={3}>TOTALI</td>
                        <td className="tar">{fmt((righe || []).reduce((s, r) => s + Number(r.importo_dare || 0), 0))}</td>
                        <td className="tar">{fmt((righe || []).reduce((s, r) => s + Number(r.importo_avere || 0), 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={() => onClose?.()} disabled={isBusy}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
