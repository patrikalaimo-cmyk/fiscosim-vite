function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function toAmount(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

export function calculateRitenutaProfessionista(input = {}) {
  const compenso = toAmount(input.compenso)
  const aliquotaCassaInput = toAmount(input.aliquotaCassa)
  const importoCassaEsplicito = input.importoCassa
  const importoCassa = importoCassaEsplicito !== undefined && importoCassaEsplicito !== null && importoCassaEsplicito !== ''
    ? toAmount(importoCassaEsplicito)
    : round2(compenso * aliquotaCassaInput / 100)
  const aliquotaCassa = compenso > 0 && importoCassaEsplicito !== undefined && importoCassaEsplicito !== null && importoCassaEsplicito !== ''
    ? round2(importoCassa / compenso * 100)
    : aliquotaCassaInput
  const quotaNonSoggetta = toAmount(input.quotaNonSoggetta)
  const sommeNonSoggette = toAmount(input.sommeNonSoggette)
  const baseRitenutaEsplicita = input.baseRitenuta
  const baseRitenuta = baseRitenutaEsplicita !== undefined && baseRitenutaEsplicita !== null && baseRitenutaEsplicita !== ''
    ? toAmount(baseRitenutaEsplicita)
    : round2(Math.max(0, compenso - quotaNonSoggetta - sommeNonSoggette))
  const aliquotaRitenuta = toAmount(input.aliquotaRitenuta)
  const ritenutaEsplicita = input.ritenuta
  const ritenuta = ritenutaEsplicita !== undefined && ritenutaEsplicita !== null && ritenutaEsplicita !== ''
    ? toAmount(ritenutaEsplicita)
    : round2(baseRitenuta * aliquotaRitenuta / 100)
  const totaleDocumento = toAmount(input.totaleDocumento)
  const nettoPagabile = round2(Math.max(0, totaleDocumento - ritenuta))

  return {
    compenso,
    aliquotaCassa,
    importoCassa,
    imponibileIva: round2(compenso + importoCassa),
    quotaNonSoggetta,
    sommeNonSoggette,
    baseRitenuta,
    aliquotaRitenuta,
    ritenuta,
    totaleDocumento,
    nettoPagabile,
  }
}
