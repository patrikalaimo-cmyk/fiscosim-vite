export default function BankingView({ contTab, societaAttiva, setContTab, ModuloBanche }) {
  if (!societaAttiva) return null
  if (contTab !== 'movimenti_banca' && contTab !== 'riconciliazione') return null

  return <ModuloBanche societaId={societaAttiva?.id} contTab={contTab} setContTab={setContTab} />
}
