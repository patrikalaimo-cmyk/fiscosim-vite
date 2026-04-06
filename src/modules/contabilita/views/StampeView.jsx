export default function StampeView({
  contTab,
  societaAttiva,
  scritture,
  pianoConti,
  causaliIva,
  StampeDetailView,
}) {
  if (!societaAttiva) return null
  if (!['registri_iva', 'partitari', 'giornale', 'mastrini', 'bilancio'].includes(contTab)) return null

  return (
    <StampeDetailView
      tipoStampa={contTab}
      societa={societaAttiva}
      scritture={scritture}
      pianoConti={pianoConti}
      causaliIva={causaliIva}
    />
  )
}
