import { fmtNumber as fmt } from './ui/formatters.js'

/** Anteprima leggibile fattura elettronica (XML parsato). */
export function FatturaCourtesyViewer({ data }) {
  if (!data) return null
  const TIPO_DOC = {
    TD01: 'Fattura',
    TD02: 'Acconto su fattura',
    TD03: 'Acconto su parcella',
    TD04: 'Nota di credito',
    TD05: 'Nota di debito',
    TD06: 'Parcella',
    TD16: 'Integrazione reverse charge',
    TD17: 'Integrazione acquisto servizi estero',
    TD18: 'Integrazione acquisto beni intracomunitari',
    TD19: 'Integrazione acquisto beni art.17',
    TD20: 'Autofattura',
    TD24: 'Fattura differita',
    TD25: 'Fattura differita (art.21 c.4)',
    TD26: 'Cessione beni ammortizzabili',
    TD27: 'Fattura per autoconsumo',
  }
  const MODALITA_PAG = {
    MP01: 'Contanti',
    MP02: 'Assegno',
    MP03: 'Assegno circolare',
    MP04: 'Contanti presso Tesoreria',
    MP05: 'Bonifico',
    MP06: 'Vaglia cambiario',
    MP07: 'Bollettino bancario',
    MP08: 'Carta di pagamento',
    MP09: 'RID',
    MP10: 'RID utenze',
    MP11: 'RID veloce',
    MP12: 'RIBA',
    MP13: 'MAV',
    MP14: 'Quietanza erario',
    MP15: 'Giroconto su conti di contabilità speciale',
    MP16: 'Domiciliazione bancaria',
    MP17: 'Domiciliazione postale',
    MP18: 'Bollettino di c/c postale',
    MP19: 'SEPA Direct Debit',
    MP20: 'SEPA Direct Debit CORE',
    MP21: 'SEPA Direct Debit B2B',
    MP22: 'Trattenuta su somme già riscosse',
    MP23: 'PagoPA',
  }
  const tipoLabel = TIPO_DOC[data.tipo] || data.tipo || 'Fattura'
  const isNC = data.tipo === 'TD04' || data.tipo === 'TD05'

  return (
    <div
      style={{
        padding: '1.5rem',
        fontSize: '.82rem',
        lineHeight: '1.6',
        background: '#fff',
        color: '#1a1a2e',
        height: '100%',
        overflow: 'auto',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '3px solid #1a1a2e',
          paddingBottom: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: isNC ? '#c0392b' : '#1a1a2e',
              letterSpacing: '-.02em',
            }}
          >
            {tipoLabel.toUpperCase()}
          </div>
          <div style={{ fontSize: '.72rem', color: '#666', marginTop: '.15rem' }}>
            Fattura Elettronica FPR12 · SDI
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>N° {data.numero}</div>
          <div style={{ fontSize: '.85rem', color: '#555' }}>del {data.data}</div>
          {data.divisa && data.divisa !== 'EUR' && (
            <div style={{ fontSize: '.72rem', color: '#888', marginTop: '.2rem' }}>Divisa: {data.divisa}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '.75rem 1rem' }}>
          <div
            style={{
              fontSize: '.65rem',
              fontWeight: 700,
              color: '#888',
              letterSpacing: '.08em',
              marginBottom: '.4rem',
            }}
          >
            CEDENTE / PRESTATORE
          </div>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.15rem' }}>{data.nome_cedente || '—'}</div>
          {data.piva_cedente && <div style={{ fontSize: '.75rem', color: '#555' }}>P.IVA: {data.piva_cedente}</div>}
          {data.cf_cedente && data.cf_cedente !== data.piva_cedente && (
            <div style={{ fontSize: '.75rem', color: '#555' }}>C.F.: {data.cf_cedente}</div>
          )}
          {data.indirizzo_cedente && (
            <div style={{ fontSize: '.72rem', color: '#777', marginTop: '.2rem' }}>{data.indirizzo_cedente}</div>
          )}
        </div>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '.75rem 1rem' }}>
          <div
            style={{
              fontSize: '.65rem',
              fontWeight: 700,
              color: '#888',
              letterSpacing: '.08em',
              marginBottom: '.4rem',
            }}
          >
            CESSIONARIO / COMMITTENTE
          </div>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.15rem' }}>
            {data.nome_cessionario || '—'}
          </div>
          {data.piva_cessionario && (
            <div style={{ fontSize: '.75rem', color: '#555' }}>P.IVA: {data.piva_cessionario}</div>
          )}
        </div>
      </div>

      {data.lines?.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={{ padding: '.5rem .75rem', textAlign: 'left', fontWeight: 600 }}>N°</th>
                <th style={{ padding: '.5rem .75rem', textAlign: 'left', fontWeight: 600 }}>Descrizione</th>
                <th style={{ padding: '.5rem .5rem', textAlign: 'right', fontWeight: 600 }}>IVA%</th>
                <th style={{ padding: '.5rem .75rem', textAlign: 'right', fontWeight: 600 }}>Totale</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '.4rem .75rem', color: '#999' }}>{l.num || i + 1}</td>
                  <td style={{ padding: '.4rem .75rem' }}>{l.desc}</td>
                  <td style={{ padding: '.4rem .5rem', textAlign: 'right' }}>{l.iva != null ? l.iva + '%' : '—'}</td>
                  <td style={{ padding: '.4rem .75rem', textAlign: 'right', fontWeight: 600 }}>
                    {l.totale != null ? fmt(l.totale) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
        <div style={{ width: 320, border: '2px solid #1a1a2e', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '.7rem .9rem',
              background: '#1a1a2e',
              color: '#fff',
            }}
          >
            <span style={{ fontWeight: 700 }}>TOTALE</span>
            <span style={{ fontWeight: 700 }}>
              {fmt(
                data.totale_doc ??
                  (Number(data.imponibile) || 0) + (Number(data.imposta) || 0)
              )}{' '}
              €
            </span>
          </div>
        </div>
      </div>

      {data.pagamenti?.length > 0 && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '.75rem 1rem' }}>
          <div
            style={{
              fontSize: '.65rem',
              fontWeight: 700,
              color: '#888',
              letterSpacing: '.08em',
              marginBottom: '.5rem',
            }}
          >
            DATI PAGAMENTO
          </div>
          {data.pagamenti.map((p, i) => (
            <div key={i} style={{ fontSize: '.78rem', marginBottom: '.4rem' }}>
              <strong>{MODALITA_PAG[p.modalita] || p.modalita || '—'}</strong>
              {p.scadenza && <span style={{ marginLeft: '.75rem' }}>Scad. {p.scadenza}</span>}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '1rem',
          paddingTop: '.75rem',
          borderTop: '1px solid #eee',
          fontSize: '.65rem',
          color: '#aaa',
        }}
      >
        Formato: {data.formato || 'FPR12'}
      </div>
    </div>
  )
}
