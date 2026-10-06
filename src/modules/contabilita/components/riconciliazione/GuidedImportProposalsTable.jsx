import { useMemo, useState } from 'react'

function tone(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('confirm')) return '#8ee7b6'
  if (normalized.includes('missing') || normalized.includes('clear')) return '#ff9fb0'
  if (normalized.includes('selected')) return '#9fd0ff'
  return '#ffd38c'
}

function confidenceLabel(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return `${Math.round(number * 100)}%`
}

function canManual(field) {
  return Boolean(field?.allowManualEdit)
}

export default function GuidedImportProposalsTable({
  fields,
  onConfirm,
  onClear,
  onRestore,
  onPickRow,
  onManualChange,
}) {
  const [manualDraftByKey, setManualDraftByKey] = useState({})

  const rows = useMemo(() => fields || [], [fields])

  return (
    <div style={{ borderRadius: 12, border: '1px solid rgba(157, 185, 213, 0.2)', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
        <thead>
          <tr style={{ background: 'rgba(10, 22, 37, 0.92)' }}>
            {['Campo', 'Valore proposto', 'Valore finale', 'Confidenza', 'Fonte', 'Stato', 'Azioni'].map((head) => (
              <th key={head} style={{ textAlign: 'left', fontSize: '.66rem', color: '#9fd0ff', padding: '.4rem .45rem', borderBottom: '1px solid rgba(157, 185, 213, 0.22)' }}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((field) => {
            const draftValue = manualDraftByKey[field.key] ?? field.finalValue ?? ''
            return (
              <tr key={field.key} style={{ borderBottom: '1px solid rgba(157, 185, 213, 0.15)' }}>
                <td style={{ fontSize: '.7rem', color: '#eef6ff', padding: '.36rem .45rem' }}>{field.label}</td>
                <td style={{ fontSize: '.7rem', color: 'rgba(220, 233, 247, 0.9)', padding: '.36rem .45rem' }}>{String(field.proposedValue || '-')}</td>
                <td style={{ fontSize: '.7rem', color: '#eef6ff', padding: '.36rem .45rem' }}>{String(field.finalValue || '-')}</td>
                <td style={{ fontSize: '.68rem', color: '#9fd0ff', padding: '.36rem .45rem' }}>{confidenceLabel(field.confidence)}</td>
                <td style={{ fontSize: '.66rem', color: 'rgba(211, 224, 238, 0.85)', padding: '.36rem .45rem' }}>
                  {field.source === 'template' || field.source === 'template_suggestion'
                    ? <span style={{ background: 'rgba(80,220,150,0.18)', color: '#8ee7b6', borderRadius: 5, padding: '1px 5px', fontWeight: 700, fontSize: '.63rem' }}>template</span>
                    : String(field.source || '-')}
                </td>
                <td style={{ fontSize: '.66rem', color: tone(field.status), padding: '.36rem .45rem', textTransform: 'uppercase' }}>{String(field.status || 'proposed').replace(/_/g, ' ')}</td>
                <td style={{ padding: '.32rem .45rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem' }}>
                    <button type="button" className="btn-sec" style={{ minHeight: 22, padding: '0 .35rem', fontSize: '.6rem' }} onClick={() => onConfirm(field.key)}>
                      Conferma
                    </button>
                    <button type="button" className="btn-sec" style={{ minHeight: 22, padding: '0 .35rem', fontSize: '.6rem' }} onClick={() => onPickRow(field.key)}>
                      Scegli riga
                    </button>
                    <button type="button" className="btn-sec" style={{ minHeight: 22, padding: '0 .35rem', fontSize: '.6rem' }} onClick={() => onClear(field.key)}>
                      Svuota
                    </button>
                    <button type="button" className="btn-sec" style={{ minHeight: 22, padding: '0 .35rem', fontSize: '.6rem' }} onClick={() => onRestore(field.key)}>
                      Ripristina proposta
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '.25rem', marginTop: '.25rem' }}>
                    <input
                      type="text"
                      value={draftValue}
                      disabled={!canManual(field)}
                      onChange={(event) => setManualDraftByKey((prev) => ({ ...prev, [field.key]: event.target.value }))}
                      placeholder={canManual(field) ? 'Modifica manuale' : 'Modifica non ammessa'}
                      style={{
                        minHeight: 24,
                        width: 180,
                        borderRadius: 8,
                        border: '1px solid rgba(157, 185, 213, 0.24)',
                        background: canManual(field) ? 'rgba(10, 20, 34, 0.9)' : 'rgba(10, 20, 34, 0.45)',
                        color: '#eef6ff',
                        padding: '0 .35rem',
                        fontSize: '.63rem',
                      }}
                    />
                    <button
                      type="button"
                      className="btn-sec"
                      disabled={!canManual(field)}
                      style={{ minHeight: 22, padding: '0 .35rem', fontSize: '.6rem' }}
                      onClick={() => onManualChange(field.key, draftValue)}
                    >
                      Applica manuale
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
