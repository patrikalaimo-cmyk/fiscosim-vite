import { useEffect, useState } from 'react'
import * as contabilitaRepo from '../../data/contabilitaRepo.js'

function fmt(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('it-IT')
  } catch {
    return value
  }
}

export function ConsultazioneDetailSidebar({
  primaNotaId,
  societaId,
  onClose,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scrittura, setScrittura] = useState(null)
  const [righe, setRighe] = useState([])

  const caricaDettaglio = async (id) => {
    if (!id) return
    setLoading(true)
    setError('')

    try {
      const { data, error: err } = await contabilitaRepo.getScritturaDettaglioById(id)
      if (err) throw err
      setScrittura(data?.scrittura || null)
      setRighe(Array.isArray(data?.righe) ? data.righe : [])
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    caricaDettaglio(primaNotaId)
  }, [primaNotaId, societaId])

  // Stati canonici attivi FASE 3: simulata, confermata, stornata, storno
  // annullata mantenuto come fallback difensivo per compatibilità con record legacy
  const isNeutralized = scrittura?.stato === 'stornata' || scrittura?.stato === 'storno' || scrittura?.stato === 'annullata'
  const isSimulata = scrittura?.stato === 'simulata'
  const readOnlyMessage = 'Consultazione read-only: modifica, storno, eliminazione e commit non sono disponibili in questo modulo.'
  const stornoCollegatoId = scrittura?.storno_id || scrittura?.storno_of_id || scrittura?.storno_collegato_id || null
  const isPeriodoChiuso = Boolean(scrittura?.periodo_chiuso_lock || scrittura?.stampa_giornale_id)

  return (
    <div
      style={{
        width: 380,
        height: 'calc(100vh - 100px)',
        position: 'sticky',
        top: '80px',
        background: 'linear-gradient(180deg, rgba(17,32,56,.98), rgba(9,17,30,.99))',
        border: '1px solid rgba(13, 122, 140, .25)',
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-10px 18px 40px rgba(0,0,0,.3)',
        overflow: 'hidden',
        animation: 'slideInRight .2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Testata Sidebar */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid rgba(255,255,255,.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,.01)',
        }}
      >
        <div>
          <div style={{ fontSize: '.7rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Ispezione Contabile</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
            Dettaglio scrittura {scrittura?.numero_registrazione ? `#${scrittura.numero_registrazione}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,.04)',
            border: 'none',
            color: 'rgba(255,255,255,.6)',
            borderRadius: '50%',
            width: 30,
            height: 30,
            cursor: 'pointer',
            fontSize: '1.1rem',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Corpo Scorrevole Sidebar */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {loading ? (
          <div className="empty" style={{ padding: '2rem 1rem' }}><div className="empty-t">Ispezione dati in corso…</div></div>
        ) : (
          <>
            {error && <div className="alert alert-warn" style={{ fontSize: '.75rem', padding: '.5rem' }}>{error}</div>}

            {/* Banner Blocco Periodo Chiuso */}
            {isPeriodoChiuso && (
              <div
                style={{
                  background: 'rgba(232, 146, 42, 0.08)',
                  border: '1px solid rgba(232, 146, 42, 0.3)',
                  borderRadius: 10,
                  padding: '.75rem .85rem',
                  fontSize: '.75rem',
                  color: 'var(--gold)',
                  lineHeight: '1.45',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.3rem',
                }}
              >
                <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                  <span>🔒</span> Periodo stampato definitivo
                </div>
                <div>
                  Le modifiche ordinarie sono bloccate. Eventuali rettifiche richiedono workflow amministrativo.
                </div>
                {scrittura?.stampa_giornale_id && (
                  <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem', fontFamily: 'monospace' }}>
                    ID Stampa: {scrittura.stampa_giornale_id.slice(0, 8)}...
                    {scrittura.giornale_pagina && ` | Pag: ${scrittura.giornale_pagina}`}
                    {scrittura.giornale_riga_progressivo && ` | Progressivo: ${scrittura.giornale_riga_progressivo}`}
                  </div>
                )}
              </div>
            )}

            {/* Metadati Header */}
            <div className="card" style={{ padding: '.8rem', background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.035)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.7rem' }}>
                <div style={{ fontWeight: 800, fontSize: '.8rem', color: '#ffb054' }}>Intestazione</div>
                {!isNeutralized && (
                  <button
                    disabled
                    style={{
                      padding: '.25rem .75rem',
                      fontSize: '.75rem',
                      background: 'rgba(255,255,255,.05)',
                      color: 'var(--mu)',
                      fontWeight: 'bold',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'not-allowed',
                      boxShadow: 'none',
                      opacity: 0.55,
                    }}
                    title={readOnlyMessage}
                  >
                    Modifica
                  </button>
                )}
              </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', fontSize: '.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Descrizione</span>
                  <span style={{ fontWeight: 700 }}>{scrittura?.descrizione || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>N° documento</span>
                  <span style={{ fontWeight: 700 }}>{scrittura?.numero_documento || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Data doc.</span>
                  <span style={{ fontWeight: 700 }}>{fmtDate(scrittura?.data_documento)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Data reg.</span>
                  <span style={{ fontWeight: 700 }}>{fmtDate(scrittura?.data_registrazione)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Causale contabile</span>
                  <span style={{ fontWeight: 700 }}>{scrittura?.causale_codice || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Causale IVA</span>
                  <span style={{ fontWeight: 700 }}>{scrittura?.causale_iva_codice || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mu)' }}>Soggetto</span>
                  <span style={{ fontWeight: 700, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scrittura?.cliente_fornitore_nome || '—'}
                  </span>
                </div>
                {scrittura?.stato && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mu)' }}>Stato</span>
                    <span
                      style={{
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isNeutralized ? '#ff8f8f' : isSimulata ? '#ffb054' : '#8be28e',
                      }}
                    >
                      {scrittura.stato}
                    </span>
                  </div>
                )}
                {stornoCollegatoId && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ color: 'var(--mu)', fontSize: '.7rem' }}>Storno collegato</span>
                    <span style={{ fontWeight: 600, fontSize: '.7rem', color: '#ff8f8f', fontFamily: 'monospace' }}>
                      {String(stornoCollegatoId).slice(0, 8)}…
                    </span>
                  </div>
                )}
              </div>
            </div>


            {/* Collegamenti Fiscali */}
            {(scrittura?.causale_iva_codice || scrittura?.cliente_fornitore_id) && (
              <div className="card" style={{ padding: '.8rem', background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.035)', borderRadius: 10 }}>
                <div style={{ fontWeight: 800, fontSize: '.8rem', color: '#ffb054', marginBottom: '.6rem' }}>Collegamenti Fiscali</div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {scrittura?.causale_iva_codice && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.3rem',
                      padding: '.25rem .5rem',
                      borderRadius: '6px',
                      background: 'rgba(26, 168, 191, 0.15)',
                      color: '#1AA8BF',
                      fontSize: '.7rem',
                      fontWeight: 600,
                      border: '1px solid rgba(26, 168, 191, 0.3)'
                    }}>
                      🏷️ IVA: {scrittura.causale_iva_codice}
                    </span>
                  )}
                  {scrittura?.cliente_fornitore_id && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.3rem',
                      padding: '.25rem .5rem',
                      borderRadius: '6px',
                      background: 'rgba(232, 146, 42, 0.15)',
                      color: '#ffb054',
                      fontSize: '.7rem',
                      fontWeight: 600,
                      border: '1px solid rgba(232, 146, 42, 0.3)'
                    }}>
                      👤 Partitario: {scrittura.cliente_fornitore_nome || 'Soggetto'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Righe Contabili detail */}
            <div className="card" style={{ padding: '.8rem', background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.035)', borderRadius: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '.8rem', color: '#1AA8BF', marginBottom: '.6rem' }}>Partite Doppie</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {righe.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '.45rem',
                      background: 'rgba(255,255,255,.01)',
                      border: '1px solid rgba(255,255,255,.025)',
                      borderRadius: 6,
                      fontSize: '.72rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span style={{ color: '#fff' }}>{r.conto_codice}</span>
                      {r.importo_dare > 0 ? (
                        <span style={{ color: '#1AA8BF' }}>{fmt(r.importo_dare)} D</span>
                      ) : (
                        <span style={{ color: '#E8922A' }}>{fmt(r.importo_avere)} A</span>
                      )}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{r.conto_descrizione}</span>
                      {r.causale_iva_codice ? <span>IVA: {r.causale_iva_codice}</span> : null}
                    </div>
                  </div>
                ))}

                {/* Grand Totals */}
                <div
                  style={{
                    marginTop: '.4rem',
                    paddingTop: '.5rem',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    fontSize: '.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mu)' }}>Totale Dare</span>
                    <span style={{ fontWeight: 700, color: '#1AA8BF' }}>{fmt(righe.reduce((s, r) => s + (r.importo_dare || 0), 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--mu)' }}>Totale Avere</span>
                    <span style={{ fontWeight: 700, color: '#E8922A' }}>{fmt(righe.reduce((s, r) => s + (r.importo_avere || 0), 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                    <span style={{ color: 'var(--mu)' }}>Bilancio quadratura</span>
                    {Math.abs(righe.reduce((s, r) => s + (r.importo_dare || 0), 0) - righe.reduce((s, r) => s + (r.importo_avere || 0), 0)) < 0.005 ? (
                      <span style={{ color: '#8be28e' }}>Quadrata ✓</span>
                    ) : (
                      <span style={{ color: '#ff8f8f' }}>Sbilanciata ⚠️</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Consultazione read-only */}
            <div className="card" style={{ padding: '.8rem', background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.035)', borderRadius: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '.8rem', color: '#1AA8BF', marginBottom: '.6rem' }}>Consultazione read-only</div>
              <div style={{ fontSize: '.72rem', color: isPeriodoChiuso ? 'var(--gold)' : isNeutralized ? '#ff8f8f' : 'var(--mu)', lineHeight: 1.45 }}>
                {isPeriodoChiuso
                  ? 'Periodo stampato definitivo/chiuso: nessuna operazione contabile è disponibile dalla Consultazione.'
                  : isNeutralized
                    ? 'Scrittura stornata o neutralizzata: dettaglio disponibile esclusivamente in lettura.'
                    : isSimulata
                      ? 'Scrittura simulata: il dettaglio è consultabile, ma modifica ed eliminazione non sono disponibili da questo modulo.'
                      : 'Il dettaglio è consultabile. Le operazioni contabili devono essere avviate dai workflow dedicati, non dalla Consultazione.'}
              </div>
              <div style={{ marginTop: '.55rem', fontSize: '.7rem', color: 'var(--mu)' }}>
                {readOnlyMessage}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Sidebar */}
      <div
        style={{
          padding: '.8rem 1rem',
          borderTop: '1px solid rgba(255,255,255,.05)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(0,0,0,.15)',
        }}
      >
        <button
          className="btn-sec"
          onClick={onClose}
          style={{ padding: '.4rem .8rem', fontSize: '.75rem', borderColor: 'rgba(255,255,255,.1)' }}
        >
          Chiudi ispezione
        </button>
      </div>
    </div>
  )
}
