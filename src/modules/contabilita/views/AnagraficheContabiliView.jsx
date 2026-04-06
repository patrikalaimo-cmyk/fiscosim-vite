export default function AnagraficheContabiliView({
  contTab,
  societaAttiva,
  pianoConti,
  causaliContabili,
  causaliIva,
  caricaTutto,
  setModalImportPDF,
  PianoContiView,
  CausaliView,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'piano_conti' && (
        <PianoContiView
          pianoConti={pianoConti}
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('piano_conti')}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'causali' && (
        <CausaliView
          causali={causaliContabili}
          tipo="contabili"
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('causali')}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'causali_iva' && (
        <CausaliView
          causali={causaliIva}
          tipo="iva"
          societaId={societaAttiva.id}
          onImport={() => setModalImportPDF('causali_iva')}
          onRefresh={caricaTutto}
        />
      )}
    </>
  )
}
