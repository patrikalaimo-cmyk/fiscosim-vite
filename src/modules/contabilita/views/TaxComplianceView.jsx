export default function TaxComplianceView({
  contTab,
  societaAttiva,
  scritture,
  causaliIva,
  caricaTutto,
  LiquidazioniIVAView,
  LIPEView,
  CorrispettiviView,
  Modello770View,
  IntrastatView,
  PercipientiView,
  RitenuteView,
  IvaAnnualeView,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'liquidazioni_iva' && (
        <LiquidazioniIVAView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}

      {contTab === 'lipe' && <LIPEView societa={societaAttiva} />}

      {contTab === 'corrispettivi' && <CorrispettiviView societa={societaAttiva} />}

      {contTab === 'f770' && <Modello770View societa={societaAttiva} />}

      {contTab === 'intrastat' && <IntrastatView societa={societaAttiva} />}

      {contTab === 'percipienti' && <PercipientiView societa={societaAttiva} onRefresh={caricaTutto} />}

      {contTab === 'ritenute' && <RitenuteView societa={societaAttiva} />}

      {contTab === 'iva_annuale' && (
        <IvaAnnualeView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}
    </>
  )
}
