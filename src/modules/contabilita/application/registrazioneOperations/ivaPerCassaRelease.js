import { round2 } from '../canonical_mapper/utils.js'

export function calculateIvaPerCassaReleaseRatio(importoChiusura, importoOriginale) {
  const closureAbs = Math.abs(Number(importoChiusura) || 0)
  const originalAbs = Math.abs(Number(importoOriginale) || 0)
  if (originalAbs <= 0.0001) return 0
  let ratio = closureAbs / originalAbs
  if (Math.abs(ratio - 1) < 0.00001 || ratio > 1) {
    ratio = 1
  }
  return ratio
}

export function sumAlreadyReleasedVatRows(releasedRows = []) {
  let imponibile = 0
  let iva = 0
  let iva_detraibile = 0
  let iva_indetraibile = 0
  for (const r of releasedRows) {
    imponibile += Number(r.imponibile) || 0
    iva += Number(r.iva) || 0
    iva_detraibile += Number(r.iva_detraibile) || 0
    iva_indetraibile += Number(r.iva_indetraibile) || 0
  }
  return {
    imponibile: Math.round(imponibile * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    iva_detraibile: Math.round(iva_detraibile * 100) / 100,
    iva_indetraibile: Math.round(iva_indetraibile * 100) / 100,
  }
}

export function capIvaPerCassaReleaseAmounts(originalRow, alreadyReleasedTotals, ratio, isFinalPayment = false) {
  const maxImponibile = originalRow.imponibile - alreadyReleasedTotals.imponibile
  const maxIva = originalRow.iva - alreadyReleasedTotals.iva
  const maxIvaDetraibile = (originalRow.iva_detraibile || 0) - (alreadyReleasedTotals.iva_detraibile || 0)
  const maxIvaIndetraibile = (originalRow.iva_indetraibile || 0) - (alreadyReleasedTotals.iva_indetraibile || 0)

  if (isFinalPayment) {
    return {
      imponibile: Math.round(maxImponibile * 100) / 100,
      iva: Math.round(maxIva * 100) / 100,
      iva_detraibile: Math.round(maxIvaDetraibile * 100) / 100,
      iva_indetraibile: Math.round(maxIvaIndetraibile * 100) / 100,
    }
  }

  const imponibile = Math.round(originalRow.imponibile * ratio * 100) / 100
  const iva = Math.round(originalRow.iva * ratio * 100) / 100
  const iva_detraibile = Math.round((originalRow.iva_detraibile || 0) * ratio * 100) / 100
  const iva_indetraibile = Math.round((originalRow.iva_indetraibile || 0) * ratio * 100) / 100

  const capValue = (proportional, max) => {
    const maxAbs = Math.abs(max)
    const propAbs = Math.abs(proportional)
    if (propAbs > maxAbs) {
      return max
    }
    return proportional
  }

  return {
    imponibile: capValue(imponibile, maxImponibile),
    iva: capValue(iva, maxIva),
    iva_detraibile: capValue(iva_detraibile, maxIvaDetraibile),
    iva_indetraibile: capValue(iva_indetraibile, maxIvaIndetraibile),
  }
}

export function buildIvaPerCassaReleaseRows({ originalRow, ratio, alreadyReleasedRows = [], isFinalPayment = false, pnPayload = {}, index = 0 }) {
  if (!originalRow || !originalRow.id) {
    return null
  }
  const alreadyReleasedTotals = sumAlreadyReleasedVatRows(alreadyReleasedRows)
  const releaseAmounts = capIvaPerCassaReleaseAmounts(originalRow, alreadyReleasedTotals, ratio, isFinalPayment)

  if (Math.abs(releaseAmounts.imponibile) < 0.009 && Math.abs(releaseAmounts.iva) < 0.009) {
    return null
  }

  return {
    documento_id: pnPayload.numero_documento || originalRow.documento_id || 'manual-reg-doc',
    riga_idx: index,
    data: pnPayload.data_documento || pnPayload.data_registrazione || originalRow.data,
    imponibile: releaseAmounts.imponibile,
    iva: releaseAmounts.iva,
    aliquota: originalRow.aliquota,
    tipo: originalRow.tipo,
    detraibile: originalRow.detraibile,
    percentuale_detraibilita: originalRow.percentuale_detraibilita,
    iva_detraibile: releaseAmounts.iva_detraibile,
    iva_indetraibile: releaseAmounts.iva_indetraibile,
    causale_iva_id: originalRow.causale_iva_id,
    societa_id: pnPayload.societa_id || originalRow.societa_id,
    numero_documento: pnPayload.numero_documento || originalRow.numero_documento,
    data_documento: pnPayload.data_documento || originalRow.data_documento,
    soggetto_denominazione: pnPayload.cliente_fornitore_nome || originalRow.soggetto_denominazione,
    esigibilita: 'rilascio',
    origin_registro_iva_id: originalRow.id,
  }
}

export async function handleIvaPerCassaRelease(db, closures = [], pnPayload = {}) {
  const releaseRows = []
  let globalIndex = 0

  for (const closure of closures) {
    if (!closure.id) continue

    const { data: dbPartita, error: partitaErr } = await db
      .from('partitario')
      .select('id, prima_nota_id, importo_originale, importo_pagato, iva_per_cassa, stato')
      .eq('id', closure.id)
      .maybeSingle()

    if (partitaErr) {
      console.error(`[handleIvaPerCassaRelease] Errore recupero partita ${closure.id}:`, partitaErr)
      continue
    }

    if (!dbPartita) {
      console.warn(`[handleIvaPerCassaRelease] Partita non trovata per ID ${closure.id}`)
      continue
    }

    if (!dbPartita.iva_per_cassa) {
      continue
    }

    const originalAmt = Number(dbPartita.importo_originale) || 0
    const pagatoBefore = Number(dbPartita.importo_pagato) || 0
    const importoChiusura = Number(closure.importoChiusura || closure.importo_chiuso || 0)
    
    const newPagato = pagatoBefore + importoChiusura
    const newResiduo = originalAmt - newPagato
    const isFinalPayment = Math.abs(newResiduo) <= 0.01

    const ratio = calculateIvaPerCassaReleaseRatio(importoChiusura, originalAmt)
    if (ratio <= 0) continue

    if (!dbPartita.prima_nota_id) {
      console.warn(`[handleIvaPerCassaRelease] Partita ${closure.id} senza prima_nota_id originaria.`)
      continue
    }

    const { data: originalVatRows, error: vatErr } = await db
      .from('registri_iva')
      .select('*')
      .eq('prima_nota_id', dbPartita.prima_nota_id)
      .eq('esigibilita', 'differita')

    if (vatErr) {
      console.error(`[handleIvaPerCassaRelease] Errore recupero registri_iva per prima_nota_id ${dbPartita.prima_nota_id}:`, vatErr)
      continue
    }

    if (!originalVatRows || originalVatRows.length === 0) {
      continue
    }

    const filteredOriginalRows = originalVatRows.filter(r => !r.origin_registro_iva_id)

    for (const originalRow of filteredOriginalRows) {
      if (!originalRow.id) {
        console.warn(`[handleIvaPerCassaRelease] Riga IVA originaria senza ID. Salto rilascio per questa riga.`)
        continue
      }

      const { data: alreadyReleasedRows, error: relErr } = await db
        .from('registri_iva')
        .select('*')
        .eq('origin_registro_iva_id', originalRow.id)
        .eq('esigibilita', 'rilascio')

      if (relErr) {
        console.error(`[handleIvaPerCassaRelease] Errore recupero righe rilascio per riga originaria ${originalRow.id}:`, relErr)
        continue
      }

      const releaseRow = buildIvaPerCassaReleaseRows({
        originalRow,
        ratio,
        alreadyReleasedRows: alreadyReleasedRows || [],
        isFinalPayment,
        pnPayload,
        index: globalIndex,
      })

      if (releaseRow) {
        releaseRows.push(releaseRow)
        globalIndex++
      }
    }
  }

  return releaseRows
}
