import React from 'react'

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function LiquidazioneIvaRegistroTable({ type = 'vendita', data = [], totali = {} }) {
  const isVendita = type === 'vendita'

  if (data.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mu)', fontSize: '0.85rem' }}>
        Nessuna registrazione per questo registro nel periodo selezionato.
      </div>
    )
  }

  return (
    <div className="tbl-wrap" style={{ border: '1px solid var(--bd)', borderRadius: '4px', overflow: 'hidden' }}>
      <table className="tbl" style={{ margin: 0 }}>
        <thead>
          {isVendita ? (
            <tr>
              <th>Codice / Aliquota</th>
              <th>Descrizione</th>
              <th className="tar">Imponibile</th>
              <th className="tar">IVA Debito Lorda</th>
              <th className="tar">IVA Split Esclusa</th>
              <th className="tar">IVA Debito Effettiva</th>
              <th className="tar">Esenti / Escluse</th>
              <th className="tar">Non Imponibili</th>
              <th className="tar">Righe</th>
            </tr>
          ) : (
            <tr>
              <th>Codice / Aliquota</th>
              <th>Descrizione</th>
              <th className="tar">Imponibile</th>
              <th className="tar">IVA Acquisti</th>
              <th className="tar">IVA Detraibile</th>
              <th className="tar">IVA Indetraibile</th>
              <th className="tar">% Detrazione</th>
              <th className="tar">Esenti / Escluse</th>
              <th className="tar">Non Imponibili</th>
              <th className="tar">Righe</th>
            </tr>
          )}
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td><strong>{row.codiceIva}</strong></td>
              <td style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{row.descrizione}</td>
              <td className="tar" style={{ fontWeight: 600 }}>{fmt(row.imponibile)}</td>
              
              {isVendita ? (
                <>
                  <td className="tar">{fmt(row.ivaDebitoLorda)}</td>
                  <td className="tar" style={{ color: 'var(--mu)' }}>{row.ivaSplitEsclusa > 0 ? `- ${fmt(row.ivaSplitEsclusa)}` : '—'}</td>
                  <td className="tar" style={{ fontWeight: 700 }}>{fmt(row.ivaDebitoEffettiva)}</td>
                </>
              ) : (
                <>
                  <td className="tar">{fmt(row.ivaAcquisti)}</td>
                  <td className="tar" style={{ fontWeight: 700, color: 'var(--gr, #2ecc71)' }}>{fmt(row.ivaDetraibile)}</td>
                  <td className="tar" style={{ color: 'var(--mu)' }}>{row.ivaIndetraibile > 0 ? fmt(row.ivaIndetraibile) : '—'}</td>
                  <td className="tar" style={{ fontWeight: 600 }}>{row.percentualeDetrazione}%</td>
                </>
              )}

              <td className="tar" style={{ color: 'var(--mu)' }}>{row.operazioniEsentiEscluse > 0 ? fmt(row.operazioniEsentiEscluse) : '—'}</td>
              <td className="tar" style={{ color: 'var(--mu)' }}>{row.operazioniNonImponibili > 0 ? fmt(row.operazioniNonImponibili) : '—'}</td>
              <td className="tar"><strong>{row.righe}</strong></td>
            </tr>
          ))}
          
          {/* Totali */}
          <tr className="total-row" style={{ background: 'var(--s2)', fontWeight: 700 }}>
            <td colSpan={2}><strong>TOTALE COMPLESSIVO</strong></td>
            <td className="tar"><strong>{fmt(totali.imponibile)}</strong></td>
            
            {isVendita ? (
              <>
                <td className="tar"><strong>{fmt(totali.ivaDebitoLorda)}</strong></td>
                <td className="tar" style={{ color: 'var(--mu)' }}><strong>{totali.ivaSplitEsclusa > 0 ? `- ${fmt(totali.ivaSplitEsclusa)}` : '—'}</strong></td>
                <td className="tar" style={{ color: 'var(--text)' }}><strong>{fmt(totali.ivaDebitoEffettiva)}</strong></td>
              </>
            ) : (
              <>
                <td className="tar"><strong>{fmt(totali.ivaAcquisti)}</strong></td>
                <td className="tar" style={{ color: 'var(--gr, #2ecc71)' }}><strong>{fmt(totali.ivaDetraibile)}</strong></td>
                <td className="tar" style={{ color: 'var(--mu)' }}><strong>{totali.ivaIndetraibile > 0 ? fmt(totali.ivaIndetraibile) : '—'}</strong></td>
                <td className="tar"><strong>{totali.ivaAcquisti > 0 ? `${Math.round((totali.ivaDetraibile / totali.ivaAcquisti) * 100)}%` : '100%'}</strong></td>
              </>
            )}

            <td className="tar" style={{ color: 'var(--mu)' }}>
              <strong>
                {fmt(data.reduce((s, g) => s + g.operazioniEsentiEscluse, 0))}
              </strong>
            </td>
            <td className="tar" style={{ color: 'var(--mu)' }}>
              <strong>
                {fmt(data.reduce((s, g) => s + g.operazioniNonImponibili, 0))}
              </strong>
            </td>
            <td className="tar">
              <strong>
                {data.reduce((s, g) => s + g.righe, 0)}
              </strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
