import { parseIvaPercent, isNaturaFatturaPA } from './resolveIva.js'

export function extractAliquota(value) {
  if (!value) return null
  const m = String(value).match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

export function percentFromCodiceInterno(codiceInterno) {
  const s = String(codiceInterno ?? '').trim().toUpperCase()
  if (!s) return null
  const m = s.match(/(\d+)\D*$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

export function pickPrimaryRiepilogoIva(riepilogoIva) {
  if (!Array.isArray(riepilogoIva) || riepilogoIva.length === 0) return null
  if (riepilogoIva.length === 1) return riepilogoIva[0]
  const nImp = (r) => {
    const x = parseFloat(String(r?.imponibile ?? r?.Imponibile ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }
  let best = riepilogoIva[0]
  let bestImp = nImp(best)
  for (let i = 1; i < riepilogoIva.length; i++) {
    const r = riepilogoIva[i]
    const imp = nImp(r)
    if (imp > bestImp) {
      best = r
      bestImp = imp
    }
  }
  return best
}

export function buildDraftRowsFromDocumentoValues({
  riepilogoLista,
  imponibile,
  iva,
  contoCostoRicavoId,
  contoIvaId,
  soggettoNome,
}) {
  const n = (v) => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }

  const riepilogoImponibileDesc = (r) => {
    const nat = String(r?.natura ?? r?.Natura ?? '').trim()
    const aliqPct = isNaturaFatturaPA(nat) ? 0 : parseIvaPercent(r?.aliquota)
    const lblAliq = aliqPct == null ? '—' : `${aliqPct}%`
    if (nat) return `Imponibile (${lblAliq} ${nat})`
    return `Imponibile (${lblAliq})`
  }

  const riepilogoIvaDesc = (r) => {
    const nat = String(r?.natura ?? r?.Natura ?? '').trim()
    const aliqPct = isNaturaFatturaPA(nat) ? 0 : parseIvaPercent(r?.aliquota)
    return aliqPct == null ? 'IVA' : `IVA (${aliqPct}%)`
  }

  const rows = []

  if (riepilogoLista.length > 1) {
    for (const r of riepilogoLista) {
      const imp = n(r?.imponibile ?? r?.Imponibile)
      const tax = n(r?.imposta ?? r?.Imposta)
      if (imp > 0) {
        rows.push({
          conto_id: contoCostoRicavoId || '',
          descrizione: riepilogoImponibileDesc(r),
          dare: imp,
          avere: ''
        })
      }
      if (tax > 0) {
        rows.push({
          conto_id: contoIvaId || '',
          descrizione: riepilogoIvaDesc(r),
          dare: tax,
          avere: ''
        })
      }
    }
  } else if (riepilogoLista.length === 1) {
    const r0 = riepilogoLista[0]
    const impR = n(r0?.imponibile ?? r0?.Imponibile)
    const taxR = n(r0?.imposta ?? r0?.Imposta)
    const impUse = impR > 0 || taxR > 0 ? impR : imponibile
    const taxUse = impR > 0 || taxR > 0 ? taxR : iva
    if (impUse > 0) {
      rows.push({
        conto_id: contoCostoRicavoId || '',
        descrizione: 'Imponibile',
        dare: impUse,
        avere: ''
      })
    }
    if (taxUse > 0) {
      rows.push({
        conto_id: contoIvaId || '',
        descrizione: 'IVA',
        dare: taxUse,
        avere: ''
      })
    }
  } else {
    if (imponibile > 0) {
      rows.push({
        conto_id: contoCostoRicavoId || '',
        descrizione: 'Imponibile',
        dare: imponibile,
        avere: ''
      })
    }
    if (iva > 0) {
      rows.push({
        conto_id: contoIvaId || '',
        descrizione: 'IVA',
        dare: iva,
        avere: ''
      })
    }
  }

  return rows
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

