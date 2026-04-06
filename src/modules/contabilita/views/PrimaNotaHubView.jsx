export default function PrimaNotaHubView({
  contTab,
  documenti,
  scritture,
  pianoConti,
  causaliIva,
  causaliContabili,
  clienti,
  societaAttiva,
  stats,
  caricaTutto,
  patchDocumento,
  confermaDoc,
  registraConfermati,
  openGuidataAt,
  pnGuidataDraft,
  pnGuidataNav,
  gotoGuidataRelative,
  setPnGuidataDraft,
  persistGuidataDraft,
  DaValidareSplitView,
  PrimaNotaView,
  PrimaNotaGuidata,
  RegistrateView,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'da_validare' && (
        <DaValidareSplitView
          documenti={documenti.filter((d) => d.workflow_status !== 'registered')}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          societaId={societaAttiva.id}
          stats={stats}
          onRefresh={caricaTutto}
          patchDocumento={patchDocumento}
          confermaDoc={confermaDoc}
          registraConfermati={registraConfermati}
          onEdit={async (doc, ids, idx) => {
            const listIds =
              Array.isArray(ids) && ids.length
                ? ids
                : documenti.filter((d) => d.workflow_status !== 'registered').map((d) => d.id)
            const i = Number.isFinite(idx) ? idx : Math.max(0, listIds.indexOf(doc.id))
            await openGuidataAt(doc, listIds, i)
          }}
        />
      )}

      {contTab === 'prima_nota' && (
        <PrimaNotaView
          scritture={scritture}
          pianoConti={pianoConti}
          causali={causaliContabili}
          causaliIva={causaliIva}
          clienti={clienti}
          societaId={societaAttiva.id}
          onRefresh={caricaTutto}
        />
      )}

      {contTab === 'prima_nota_guidata' && (
        <PrimaNotaGuidata
          pianoConti={pianoConti}
          causali={causaliContabili}
          causaliIva={causaliIva}
          clientiFornitori={clienti}
          initialDraft={pnGuidataDraft}
          fromImport={true}
          societaId={societaAttiva?.id}
          onPrev={() => gotoGuidataRelative(-1)}
          onNext={() => gotoGuidataRelative(+1)}
          canPrev={pnGuidataNav.idx > 0}
          canNext={pnGuidataNav.idx >= 0 && pnGuidataNav.idx < (pnGuidataNav.ids?.length || 0) - 1}
          onDraftChange={(d) => {
            setPnGuidataDraft(d)
            persistGuidataDraft(d)
          }}
        />
      )}

      {contTab === 'registrate' && (
        <RegistrateView documenti={documenti.filter((d) => d.workflow_status === 'registered')} />
      )}
    </>
  )
}
