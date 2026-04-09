import { ImportActionsBar } from './ImportActionsBar.jsx'
import { ImportDocumentCard } from './ImportDocumentCard.jsx'

export function ImportDocumentsList({
  societaId,
  documenti,
  onConfermaTutti,
  onSvuotaTutto,
  onConfermaDocumento,
  onEliminaDocumento,
  clienti,
  pianoConti,
  causaliIva,
  tipiDocumento,
  aliquoteIva,
  fmt,
  actionsBusy = false,
}) {
  if (!societaId) {
    return <div style={{ textAlign: 'center', padding: '1.25rem 0 .5rem', color: 'var(--mu)' }}>Seleziona una società per iniziare</div>
  }

  if (documenti.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0 .25rem', color: 'var(--mu)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '.35rem' }}>✓</div>
        <div>Nessun documento in attesa di conferma</div>
      </div>
    )
  }

  return (
    <div>
      <ImportActionsBar
        documenti={documenti}
        onConfermaTutti={onConfermaTutti}
        onSvuotaTutto={onSvuotaTutto}
        busy={actionsBusy}
      />
      {documenti.map((doc) => (
        <ImportDocumentCard
          key={doc.id}
          doc={doc}
          onConferma={onConfermaDocumento}
          onElimina={onEliminaDocumento}
          clienti={clienti}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          societaId={societaId}
          tipiDocumento={tipiDocumento}
          aliquoteIva={aliquoteIva}
          fmt={fmt}
        />
      ))}
    </div>
  )
}
