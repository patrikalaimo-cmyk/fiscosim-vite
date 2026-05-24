import { useMemo, useState } from 'react'

function includesIban(text) {
  return /IT\d{2}[A-Z0-9]{10,}/i.test(String(text || ''))
}

function includesHeaderWords(text) {
  const normalized = String(text || '').toUpperCase()
  return normalized.includes('DATA') && (normalized.includes('VALUTA') || normalized.includes('SEGNO'))
}

export default function GuidedImportExtractedRowsPicker({
  open,
  targetLabel,
  targetKey,
  rows,
  onClose,
  onSelect,
}) {
  const [amountSelectionByRow, setAmountSelectionByRow] = useState({})

  const filteredRows = useMemo(() => {
    if (!open) return []
    const source = rows || []
    if (targetKey === 'iban') {
      return source.filter((row) => includesIban(row.text) || row.candidateTypes?.includes('iban'))
    }
    if (targetKey === 'movement_header') {
      return source.filter((row) => includesHeaderWords(row.text) || row.candidateTypes?.includes('movement_header'))
    }
    return source
  }, [open, rows, targetKey])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 8, 15, 0.72)', zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(1100px, 94vw)', maxHeight: '86vh', overflow: 'auto', borderRadius: 14, border: '1px solid rgba(157, 185, 213, 0.24)', background: 'linear-gradient(180deg, rgba(9, 20, 35, 0.98) 0%, rgba(6, 13, 23, 0.98) 100%)', color: '#eef6ff' }}>
        <div style={{ padding: '.65rem .75rem', borderBottom: '1px solid rgba(157, 185, 213, 0.2)', display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
          <div>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#9fd0ff' }}>Picker righe estratte demo</div>
            <div style={{ fontSize: '.66rem', color: 'rgba(211, 224, 238, 0.85)' }}>Campo target: {targetLabel} ({targetKey})</div>
          </div>
          <button type="button" className="btn-sec" style={{ minHeight: 24, fontSize: '.62rem' }} onClick={onClose}>Chiudi</button>
        </div>

        <div style={{ padding: '.6rem .75rem', display: 'grid', gap: '.35rem' }}>
          {filteredRows.map((row) => {
            const candidateAmounts = Array.isArray(row.candidateAmounts) ? row.candidateAmounts : []
            const selectedAmount = amountSelectionByRow[row.rowId] ?? (candidateAmounts[0] ?? null)
            return (
              <div key={row.rowId} style={{ border: '1px solid rgba(157, 185, 213, 0.2)', borderRadius: 10, padding: '.45rem .5rem', background: 'rgba(11, 24, 40, 0.68)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.66rem', color: '#9fd0ff' }}>p.{row.pageNumber} riga {row.lineNumber} | conf {Math.round(Number(row.confidence || 0) * 100)}%</div>
                    <div style={{ fontSize: '.72rem', color: '#eef6ff', marginTop: '.08rem', lineHeight: 1.35 }}>{row.text}</div>
                    <div style={{ fontSize: '.65rem', color: 'rgba(211, 224, 238, 0.84)', marginTop: '.08rem' }}>candidateTypes: {(row.candidateTypes || []).join(', ') || '-'}</div>
                    <div style={{ fontSize: '.65rem', color: 'rgba(211, 224, 238, 0.84)' }}>date candidate: {(row.candidateDates || []).join(', ') || '-'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: '.25rem', justifyItems: 'end' }}>
                    {candidateAmounts.length ? (
                      <select
                        value={selectedAmount == null ? '' : String(selectedAmount)}
                        onChange={(event) => setAmountSelectionByRow((prev) => ({ ...prev, [row.rowId]: Number(event.target.value) }))}
                        style={{ minHeight: 24, borderRadius: 8, border: '1px solid rgba(157, 185, 213, 0.24)', background: 'rgba(9, 19, 33, 0.95)', color: '#eef6ff', fontSize: '.63rem', padding: '0 .35rem', minWidth: 120 }}
                      >
                        {candidateAmounts.map((amount) => (
                          <option key={`${row.rowId}-${amount}`} value={amount}>{amount}</option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      className="btn-sec"
                      style={{ minHeight: 24, padding: '0 .5rem', fontSize: '.62rem' }}
                      onClick={() => onSelect(row, selectedAmount)}
                    >
                      Usa questa riga
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {!filteredRows.length ? (
            <div style={{ fontSize: '.72rem', color: 'rgba(211, 224, 238, 0.82)', padding: '.35rem 0' }}>
              Nessuna riga compatibile con il filtro corrente.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
