import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

export function calculateRegistrazionePartitarioSelection({ partite = [], selectedPartitaId = '', importoChiusura = '' } = {}) {
  const list = Array.isArray(partite) ? partite : []
  const selected = list.find((item) => String(item?.id || '').trim() === String(selectedPartitaId || '').trim()) || list[0] || null
  if (!selected) {
    return {
      selectedPartita: null,
      saldoResiduo: 0,
      importoChiusura: toAmount(importoChiusura),
      segnoChiusura: '',
      stato: 'vuoto',
    }
  }

  const saldoResiduo = toAmount(selected.saldoResiduo ?? selected.saldo_residuo ?? selected.importo_residuo ?? selected.residuo ?? selected.saldo ?? 0)
  const suggestedImportoChiusura = importoChiusura === '' || importoChiusura == null ? Math.abs(saldoResiduo) : toAmount(importoChiusura)
  const segnoChiusura = saldoResiduo < 0 ? 'D' : 'A'

  return {
    selectedPartita: selected,
    saldoResiduo,
    importoChiusura: suggestedImportoChiusura,
    segnoChiusura,
    stato: selected ? 'selezionata' : 'vuoto',
  }
}
