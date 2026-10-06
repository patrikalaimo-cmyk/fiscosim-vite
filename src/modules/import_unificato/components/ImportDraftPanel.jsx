import { ImportRow } from './ImportRow.jsx'
import { BaseCombobox } from '../../../shared/ui/BaseDropdown.jsx'

export function ImportDraftPanel({
  form,
  up,
  fmt,
  causaliIva,
  aliquoteIva,
  cercaConto,
  setCercaConto,
  contiFiltered,
  contoSuggestions = [],
  historicalContoSuggestions = [],
  historicalContoLoading = false,
  pianoConti,
  showAnteprimaDocumento = false,
  onAnteprimaDocumento = null,
}) {
  const ivaOptions = (causaliIva || [])
    ?.filter((c) => c.aliquota > 0 || ['esente', 'escluso', 'non_imponibile'].includes(c.tipo))
    .map((c) => ({
      id: String(c.id),
      aliquota: Number(c.aliquota || 0),
      label: `${Number(c.aliquota || 0)}% - ${c.descrizione}`,
    })) || []

  const pickDefaultIvaId = (row) => {
    const explicit = row?.causale_iva_id ? String(row.causale_iva_id) : ''
    if (explicit) return explicit
    const pct = Math.round(parseFloat(String(row?.aliquota ?? '0').replace(/[%\\s]/g, '').replace(',', '.')) || 0)
    const match = ivaOptions.find((o) => Math.round(o.aliquota) === pct)
    return match?.id || ''
  }

  return (
    <div>
      <div
        style={{
          fontSize: '.7rem',
          fontWeight: 700,
          color: 'var(--mu)',
          marginBottom: '.5rem',
          letterSpacing: '.06em',
        }}
      >
        IMPORTI
      </div>

      {form.riepilogo_iva?.length > 0 ? (
        <div style={{ marginBottom: '.75rem' }}>
          <table style={{ width: '100%', fontSize: '.75rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd)' }}>
                <th style={{ padding: '.3rem', textAlign: 'left', color: 'var(--mu)', fontWeight: 600 }}>Aliquota</th>
                <th style={{ padding: '.3rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 600 }}>Imponibile</th>
                <th style={{ padding: '.3rem', textAlign: 'right', color: 'var(--mu)', fontWeight: 600 }}>IVA</th>
              </tr>
            </thead>
            <tbody>
              {form.riepilogo_iva.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                  <td style={{ padding: '.25rem' }}>
                    <BaseCombobox
                      value={String(r?.causale_iva_id ?? pickDefaultIvaId(r) ?? '')}
                      onChange={(id) => {
                        const sel = (causaliIva || []).find((c) => String(c.id) === String(id)) || null
                        const nv = [...form.riepilogo_iva]
                        nv[i] = {
                          ...nv[i],
                          causale_iva_id: id || '',
                          // Keep old behavior: switching the "aliquota" selector changes the underlying aliquota too.
                          aliquota: sel?.aliquota != null ? String(sel.aliquota) : nv[i].aliquota,
                        }
                        up('riepilogo_iva', nv)
                      }}
                      options={[{ id: '', label: 'Seleziona...' }, ...ivaOptions]}
                      getOptionId={(o) => o?.id}
                      getOptionLabel={(o) => o?.label}
                      searchable
                      maxItems={160}
                    />
                    {/*
                    <select
                      value={r.aliquota}
                      onChange={(e) => {
                        const nv = [...form.riepilogo_iva]
                        nv[i] = { ...nv[i], aliquota: e.target.value }
                        up('riepilogo_iva', nv)
                      }}
                      style={{
                        background: 'var(--s2)',
                        border: '1px solid var(--bd)',
                        color: 'var(--tx)',
                        borderRadius: 4,
                        padding: '.15rem .3rem',
                        fontSize: '.72rem',
                        width: '100%',
                      }}
                    >
                      {causaliIva
                        ?.filter((c) => c.aliquota > 0 || ['esente', 'escluso', 'non_imponibile'].includes(c.tipo))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.aliquota}% — {c.descrizione}
                          </option>
                        ))}
                    </select>
                    */}
                  </td>
                  <td style={{ padding: '.25rem' }}>
                    <input
                      type="number"
                      value={r.imponibile || ''}
                      step="0.01"
                      onChange={(e) => {
                        const nv = [...form.riepilogo_iva]
                        nv[i] = { ...nv[i], imponibile: parseFloat(e.target.value) || 0 }
                        up('riepilogo_iva', nv)
                      }}
                      style={{
                        width: '100%',
                        background: 'var(--s2)',
                        border: '1px solid var(--bd)',
                        color: 'var(--tx)',
                        borderRadius: 4,
                        padding: '.15rem .3rem',
                        fontSize: '.72rem',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                  <td style={{ padding: '.25rem' }}>
                    <input
                      type="number"
                      value={r.imposta || ''}
                      step="0.01"
                      onChange={(e) => {
                        const nv = [...form.riepilogo_iva]
                        nv[i] = { ...nv[i], imposta: parseFloat(e.target.value) || 0 }
                        up('riepilogo_iva', nv)
                      }}
                      style={{
                        width: '100%',
                        background: 'var(--s2)',
                        border: '1px solid var(--bd)',
                        color: 'var(--tx)',
                        borderRadius: 4,
                        padding: '.15rem .3rem',
                        fontSize: '.72rem',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => up('riepilogo_iva', [...form.riepilogo_iva, { aliquota: '22', imponibile: 0, imposta: 0, natura: '' }])}
            style={{
              marginTop: '.3rem',
              fontSize: '.7rem',
              background: 'transparent',
              border: '1px dashed var(--bd)',
              color: 'var(--mu)',
              borderRadius: 4,
              padding: '.2rem .5rem',
              cursor: 'pointer',
            }}
          >
            + Aliquota
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '.75rem' }}>
          <ImportRow label="Imponibile €" value={form.imponibile} onChange={(v) => up('imponibile', v)} type="number" />
          <div style={{ marginTop: '.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.2rem' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--mu)' }}>Aliquota IVA</div>
              {form.aliquota_iva_default && (
                <span
                  style={{
                    fontSize: '.65rem',
                    background: 'rgba(52,194,122,.12)',
                    border: '1px solid rgba(52,194,122,.3)',
                    color: '#34c27a',
                    borderRadius: 4,
                    padding: '.1rem .35rem',
                  }}
                >
                  da anagrafica
                </span>
              )}
            </div>
            <select
              value={form.aliquota_iva || form.aliquota_iva_default || '22'}
              onChange={(e) => up('aliquota_iva', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--s2)',
                border: '1px solid var(--bd)',
                color: 'var(--tx)',
                borderRadius: 6,
                padding: '.35rem .5rem',
                fontSize: '.78rem',
              }}
            >
              {aliquoteIva.map((a) => (
                <option key={a.val} value={a.val}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <ImportRow label="IVA €" value={form.iva_totale} onChange={(v) => up('iva_totale', v)} type="number" />
        </div>
      )}

      <div
        style={{
          background: 'rgba(200,164,94,.08)',
          border: '1px solid rgba(200,164,94,.2)',
          borderRadius: 6,
          padding: '.5rem .75rem',
          marginBottom: '.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--mu)' }}>TOTALE</span>
          <input
            type="number"
            value={form.totale || ''}
            step="0.01"
            onChange={(e) => up('totale', parseFloat(e.target.value) || 0)}
            style={{
              width: 120,
              background: 'transparent',
              border: 'none',
              color: 'var(--gold)',
              fontSize: '1rem',
              fontWeight: 700,
              textAlign: 'right',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)', letterSpacing: '.06em' }}>CONTO CONTABILE</div>
        {form.conto_da_anagrafica && (
          <span
            style={{
              fontSize: '.65rem',
              background: 'rgba(52,194,122,.12)',
              border: '1px solid rgba(52,194,122,.3)',
              color: '#34c27a',
              borderRadius: 4,
              padding: '.1rem .4rem',
            }}
          >
            da anagrafica
          </span>
        )}
        {form.conto_da_ai && (
          <span
            style={{
              fontSize: '.65rem',
              background: 'rgba(200,164,94,.15)',
              border: '1px solid rgba(200,164,94,.35)',
              color: 'var(--gold)',
              borderRadius: 4,
              padding: '.1rem .4rem',
            }}
          >
            proposta AI
          </span>
        )}
        {form.conto_da_storico && (
          <span
            style={{
              fontSize: '.65rem',
              background: 'rgba(52,194,122,.12)',
              border: '1px solid rgba(52,194,122,.3)',
              color: '#34c27a',
              borderRadius: 4,
              padding: '.1rem .4rem',
            }}
          >
            da storico
          </span>
        )}
      </div>
      <input
        placeholder="Cerca conto (es. fornitori, acquisti...)"
        value={form.conto_search || cercaConto}
        onChange={(e) => {
          setCercaConto(e.target.value)
          up('conto_search', e.target.value)
          if (!e.target.value) up('conto_id', null)
        }}
        style={{
          width: '100%',
          background: 'var(--s2)',
          border: '1px solid var(--bd)',
          color: 'var(--tx)',
          borderRadius: 6,
          padding: '.35rem .5rem',
          fontSize: '.78rem',
          marginBottom: '.3rem',
        }}
      />
      <div style={{ marginBottom: '.5rem' }}>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.25rem', letterSpacing: '.06em' }}>
          SUGGERIMENTI AI
        </div>
        {Array.isArray(contoSuggestions) && contoSuggestions.length > 0 ? (
          <div style={{ display: 'grid', gap: '.35rem' }}>
            {contoSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  up('conto_id', s.id)
                  up('conto_search', `${s.codice} — ${s.descrizione}`)
                  up('conto_da_ai', true)
                  up('conto_da_storico', false)
                  setCercaConto('')
                }}
                style={{
                  textAlign: 'left',
                  width: '100%',
                  background: 'rgba(200,164,94,.08)',
                  border: '1px solid rgba(200,164,94,.25)',
                  color: 'var(--tx)',
                  borderRadius: 8,
                  padding: '.45rem .55rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700 }}>
                    <code style={{ color: 'var(--gold)' }}>{s.codice}</code> {s.descrizione}
                  </div>
                  <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{s.score}%</span>
                </div>
                {Array.isArray(s.reasons) && s.reasons.length > 0 && (
                  <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem' }}>
                    {s.reasons.join(' · ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
            Nessun conto da suggerire con sufficiente confidenza.
          </div>
        )}
      </div>

      <div style={{ marginBottom: '.5rem' }}>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#34c27a', marginBottom: '.25rem', letterSpacing: '.06em' }}>
          STORICO CONFERMATO
        </div>
        {historicalContoLoading ? (
          <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
            Cerco fatture confermate nello storico...
          </div>
        ) : Array.isArray(historicalContoSuggestions) && historicalContoSuggestions.length > 0 ? (
          <div style={{ display: 'grid', gap: '.35rem' }}>
            {historicalContoSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  up('conto_id', s.id)
                  up('conto_search', `${s.codice} â€” ${s.descrizione}`)
                  up('conto_da_storico', true)
                  up('conto_da_ai', false)
                  setCercaConto('')
                }}
                style={{
                  textAlign: 'left',
                  width: '100%',
                  background: 'rgba(52,194,122,.08)',
                  border: '1px solid rgba(52,194,122,.25)',
                  color: 'var(--tx)',
                  borderRadius: 8,
                  padding: '.45rem .55rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700 }}>
                    <code style={{ color: '#34c27a' }}>{s.codice}</code> {s.descrizione}
                  </div>
                  <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{s.score}%</span>
                </div>
                {Array.isArray(s.reasons) && s.reasons.length > 0 && (
                  <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem' }}>
                    {s.reasons.join(' Â· ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
            Nessun storico confermato utile trovato.
          </div>
        )}
      </div>

      {cercaConto && contiFiltered.length > 0 && (
        <div
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--bd)',
            borderRadius: 6,
            maxHeight: 160,
            overflowY: 'auto',
            marginBottom: '.5rem',
          }}
        >
          {contiFiltered.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                up('conto_id', c.id)
                up('conto_da_ai', false)
                up('conto_da_storico', false)
                up('conto_search', `${c.codice} — ${c.descrizione}`)
                setCercaConto('')
              }}
              style={{
                padding: '.4rem .6rem',
                cursor: 'pointer',
                fontSize: '.75rem',
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                gap: '.5rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--s2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <code style={{ color: 'var(--gold)', flexShrink: 0 }}>{c.codice}</code>
              <span>{c.descrizione}</span>
            </div>
          ))}
        </div>
      )}
      {form.conto_id && (
        <div>
          <div style={{ fontSize: '.72rem', color: '#34c27a', marginBottom: '.4rem' }}>
            ✓ {form.conto_search || pianoConti?.find((c) => c.id === form.conto_id)?.descrizione}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.5rem',
              cursor: 'pointer',
              fontSize: '.72rem',
              color: 'var(--mu)',
            }}
          >
            <div
              onClick={() => up('salva_contropartita', !form.salva_contropartita)}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                cursor: 'pointer',
                transition: 'background .2s',
                background: form.salva_contropartita ? 'var(--gold)' : 'var(--bd)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: form.salva_contropartita ? 14 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--bg-main)',
                  transition: 'left .2s',
                }}
              />
            </div>
            <span>Usa questo conto per le future registrazioni di questo fornitore</span>
          </label>

          {showAnteprimaDocumento && typeof onAnteprimaDocumento === 'function' && (
            <div style={{ marginTop: '.6rem' }}>
              <button
                type="button"
                onClick={onAnteprimaDocumento}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid var(--bd)',
                  color: 'var(--mu)',
                  borderRadius: 6,
                  padding: '.35rem .6rem',
                  fontSize: '.78rem',
                  cursor: 'pointer',
                }}
              >
                Anteprima documento
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
