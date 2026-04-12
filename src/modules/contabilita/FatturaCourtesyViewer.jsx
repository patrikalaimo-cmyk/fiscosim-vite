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
    MP15: 'Giroconto su conti di contabilitÃ  speciale',
    MP16: 'Domiciliazione bancaria',
    MP17: 'Domiciliazione postale',
    MP18: 'Bollettino di c/c postale',
    MP19: 'SEPA Direct Debit',
    MP20: 'SEPA Direct Debit CORE',
    MP21: 'SEPA Direct Debit B2B',
    MP22: 'Trattenuta su somme giÃ  riscosse',
    MP23: 'PagoPA',
  }

  const tipoLabel = TIPO_DOC[data.tipo] || data.tipo || 'Fattura'
  const isNC = data.tipo === 'TD04' || data.tipo === 'TD05'

  return (
    <div className="erp-fattura-viewer">
      <div className="erp-fattura-hdr">
        <div>
          <div className="erp-fattura-title" style={{ color: isNC ? 'var(--rd)' : 'var(--text-primary)' }}>
            {tipoLabel.toUpperCase()}
          </div>
          <div className="erp-fattura-subtitle">Fattura Elettronica FPR12 · SDI</div>
        </div>
        <div className="erp-fattura-meta">
          <div className="erp-fattura-number">N° {data.numero}</div>
          <div className="erp-fattura-date">del {data.data}</div>
          {data.divisa && data.divisa !== 'EUR' && <div className="erp-fattura-currency">Divisa: {data.divisa}</div>}
        </div>
      </div>

      <div className="erp-fattura-grid">
        <div className="erp-fattura-box">
          <div className="erp-fattura-kicker">CEDENTE / PRESTATORE</div>
          <div className="erp-fattura-name">{data.nome_cedente || '—'}</div>
          {data.piva_cedente && <div className="erp-fattura-line">P.IVA: {data.piva_cedente}</div>}
          {data.cf_cedente && data.cf_cedente !== data.piva_cedente && <div className="erp-fattura-line">C.F.: {data.cf_cedente}</div>}
          {data.indirizzo_cedente && <div className="erp-fattura-line erp-fattura-address">{data.indirizzo_cedente}</div>}
        </div>

        <div className="erp-fattura-box">
          <div className="erp-fattura-kicker">CESSIONARIO / COMMITTENTE</div>
          <div className="erp-fattura-name">{data.nome_cessionario || '—'}</div>
          {data.piva_cessionario && <div className="erp-fattura-line">P.IVA: {data.piva_cessionario}</div>}
        </div>
      </div>

      {data.lines?.length > 0 && (
        <div className="erp-fattura-section">
          <table className="erp-fattura-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descrizione</th>
                <th className="tbl-num">IVA%</th>
                <th className="tbl-num">Totale</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i}>
                  <td className="erp-fattura-index">{l.num || i + 1}</td>
                  <td>{l.desc}</td>
                  <td className="tbl-num">{l.iva != null ? `${l.iva}%` : '—'}</td>
                  <td className="tbl-num erp-fattura-amount">{l.totale != null ? fmt(l.totale) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="erp-fattura-total-wrap">
        <div className="erp-fattura-total">
          <div className="erp-fattura-total-label">TOTALE</div>
          <div className="erp-fattura-total-value">
            {fmt(data.totale_doc ?? (Number(data.imponibile) || 0) + (Number(data.imposta) || 0))} €
          </div>
        </div>
      </div>

      {data.pagamenti?.length > 0 && (
        <div className="erp-fattura-box">
          <div className="erp-fattura-kicker">DATI PAGAMENTO</div>
          {data.pagamenti.map((p, i) => (
            <div key={i} className="erp-fattura-payment">
              <strong>{MODALITA_PAG[p.modalita] || p.modalita || '—'}</strong>
              {p.scadenza && <span>Scad. {p.scadenza}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="erp-fattura-footer">Formato: {data.formato || 'FPR12'}</div>
    </div>
  )
}
