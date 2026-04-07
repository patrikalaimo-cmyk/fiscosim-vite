import { ImportRow } from './ImportRow.jsx'
import { ImportAnagraficaMatcher } from './ImportAnagraficaMatcher.jsx'
import { ImportDraftPanel } from './ImportDraftPanel.jsx'

export function ImportPreviewPanel({
  form,
  up,
  fmt,
  clienti,
  pianoConti,
  causaliIva,
  aliquoteIva,
  cercaConto,
  setCercaConto,
  contiFiltered,
}) {
  const isFattura = form.tipo_documento?.startsWith('fattura')
  const isF24 = form.tipo_documento === 'f24'
  const isAvviso = form.tipo_documento === 'avviso_ade'

  return (
    <div style={{ padding: '1rem' }}>
      {isFattura && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <ImportAnagraficaMatcher form={form} up={up} clienti={clienti} />
          <ImportDraftPanel
            form={form}
            up={up}
            fmt={fmt}
            causaliIva={causaliIva}
            aliquoteIva={aliquoteIva}
            cercaConto={cercaConto}
            setCercaConto={setCercaConto}
            contiFiltered={contiFiltered}
            pianoConti={pianoConti}
          />
        </div>
      )}

      {isF24 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
            <ImportRow label="Contribuente" value={form.contribuente} onChange={(v) => up('contribuente', v)} />
            <ImportRow label="Codice Fiscale" value={form.cf_f24} onChange={(v) => up('cf_f24', v)} />
            <ImportRow label="Data versamento" value={form.data_versamento} onChange={(v) => up('data_versamento', v)} type="date" />
          </div>
          {form.sezione_erario?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.4rem', letterSpacing: '.06em' }}>SEZIONE ERARIO</div>
              <table style={{ width: '100%', fontSize: '.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--s1)' }}>
                    <th style={{ padding: '.3rem', textAlign: 'left' }}>Cod. Tributo</th>
                    <th style={{ padding: '.3rem', textAlign: 'left' }}>Periodo</th>
                    <th style={{ padding: '.3rem', textAlign: 'right', color: '#e05252' }}>Debito €</th>
                    <th style={{ padding: '.3rem', textAlign: 'right', color: '#34c27a' }}>Credito €</th>
                  </tr>
                </thead>
                <tbody>
                  {form.sezione_erario.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '.3rem' }}><code style={{ color: 'var(--gold)' }}>{r.codice_tributo}</code></td>
                      <td style={{ padding: '.3rem', color: 'var(--mu)' }}>{r.mese_rif}/{r.anno_rif}</td>
                      <td style={{ padding: '.3rem', textAlign: 'right', color: r.debito > 0 ? '#e05252' : 'var(--mu)' }}>{r.debito > 0 ? fmt(r.debito) : '—'}</td>
                      <td style={{ padding: '.3rem', textAlign: 'right', color: r.credito > 0 ? '#34c27a' : 'var(--mu)' }}>{r.credito > 0 ? fmt(r.credito) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {form.sezione_inps?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.4rem', letterSpacing: '.06em' }}>SEZIONE INPS</div>
              <table style={{ width: '100%', fontSize: '.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--s1)' }}>
                    <th style={{ padding: '.3rem', textAlign: 'left' }}>Cod/Causale</th>
                    <th style={{ padding: '.3rem', textAlign: 'left' }}>Matricola</th>
                    <th style={{ padding: '.3rem', textAlign: 'left' }}>Periodo</th>
                    <th style={{ padding: '.3rem', textAlign: 'right', color: '#e05252' }}>Debito €</th>
                    <th style={{ padding: '.3rem', textAlign: 'right', color: '#34c27a' }}>Credito €</th>
                  </tr>
                </thead>
                <tbody>
                  {form.sezione_inps.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '.3rem' }}><code style={{ color: 'var(--gold)' }}>{r.codice} {r.causale}</code></td>
                      <td style={{ padding: '.3rem', color: 'var(--mu)', fontSize: '.7rem' }}>{r.matricola}</td>
                      <td style={{ padding: '.3rem', color: 'var(--mu)' }}>{r.periodo}</td>
                      <td style={{ padding: '.3rem', textAlign: 'right', color: r.debito > 0 ? '#e05252' : 'var(--mu)' }}>{r.debito > 0 ? fmt(r.debito) : '—'}</td>
                      <td style={{ padding: '.3rem', textAlign: 'right', color: r.credito > 0 ? '#34c27a' : 'var(--mu)' }}>{r.credito > 0 ? fmt(r.credito) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'rgba(200,164,94,.08)', border: '1px solid rgba(200,164,94,.3)', borderRadius: 8, padding: '.6rem 1rem', textAlign: 'right' }}>
              <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>Saldo finale</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)' }}>{fmt(form.saldo_finale)} €</div>
            </div>
          </div>
        </div>
      )}

      {isAvviso && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <ImportRow label="Tipo avviso" value={form.tipo_avviso} onChange={(v) => up('tipo_avviso', v)} />
            <ImportRow label="N° Atto" value={form.numero_atto} onChange={(v) => up('numero_atto', v)} />
            <ImportRow label="Destinatario" value={form.cedente_denom} onChange={(v) => up('cedente_denom', v)} />
            <ImportRow label="Codice Fiscale" value={form.cedente_cf || form.cf_f24} onChange={(v) => up('cedente_cf', v)} />
          </div>
          <div>
            <ImportRow label="Importo €" value={form.importo_avviso} onChange={(v) => up('importo_avviso', v)} type="number" />
            <ImportRow label="Scadenza" value={form.scadenza} onChange={(v) => up('scadenza', v)} type="date" />
            <ImportRow label="Anno imposta" value={form.anno_imposta} onChange={(v) => up('anno_imposta', v)} />
            <ImportRow label="Modello dichiar." value={form.modello_dich} onChange={(v) => up('modello_dich', v)} />
          </div>
        </div>
      )}

      {form.causale !== undefined && (
        <div style={{ marginTop: '.75rem' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginBottom: '.2rem' }}>Causale / Descrizione</div>
          <input
            value={form.causale || ''}
            onChange={(e) => up('causale', e.target.value)}
            style={{
              width: '100%',
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
              color: 'var(--tx)',
              borderRadius: 6,
              padding: '.35rem .5rem',
              fontSize: '.78rem',
            }}
          />
        </div>
      )}
    </div>
  )
}
