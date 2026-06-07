import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { normalizeRegistrazioneIvaRows } from './normalizeRegistrazioneIvaRows.js'
import { calculateRegistrazioneIvaRow } from './calculateRegistrazioneIvaRow.js'
import { resolveRegistrazioneCausaleIvaBehavior } from '../../domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'

function resolveMeaningfulText(value, fallback = '') {
  const normalized = normalizeText(value)
  if (!normalized || normalized === 'da assegnare') {
    return normalizeText(fallback)
  }
  return normalized
}

function normalizeCausaleIvaCandidate(item = {}) {
  const source = item && typeof item === 'object' ? item : {}
  return {
    id: normalizeText(source.id || source.causaleIvaId || source.causale_iva_id || source.codice || source.code || source.sigla || source.codiceInterno || source.codice_interno),
    codice: normalizeText(source.codice || source.code || source.sigla || source.codiceInterno || source.codice_interno),
    descrizione: normalizeText(source.descrizione || source.description || source.denominazione || source.nome),
    aliquota: source.aliquota ?? source.percentuale_imposta ?? source.aliquota_iva ?? '',
    natura: normalizeText(source.natura || source.codice_natura || source.natura_iva),
    registroIva: normalizeText(source.registroIva || source.registro_iva || source.codice_registro_iva),
    segnoRegistro: normalizeText(source.segnoRegistro || source.segno_registro || source.segno_registro_iva || source.segno),
    percentualeDetraibilita: source.percentualeDetraibilita ?? source.percentuale_detraibilita ?? '',
    percentualeIndetraibilita: source.percentualeIndetraibilita ?? source.percentuale_indetraibilita ?? '',
    detraibile: source.detraibile,
    contoIva: normalizeText(source.contoIva || source.conto_iva || source.conto_iva_id),
  }
}

function buildCausaleLabel(item = {}) {
  const code = normalizeText(item?.codice || item?.code || item?.sigla || '')
  const descr = normalizeText(item?.descrizione || item?.description || item?.denominazione || item?.nome || '')
  return [code, descr].filter(Boolean).join(' - ') || ''
}

function resolveCatalogCandidate(query = '', items = []) {
  const normalizedQuery = normalizeText(query).toLowerCase().trim()
  if (!normalizedQuery) return null
  const catalog = Array.isArray(items) ? items : []
  const exactMatches = catalog
    .map(normalizeCausaleIvaCandidate)
    .filter((item) => {
      const label = buildCausaleLabel(item).toLowerCase().trim()
      const code = normalizeText(item.codice).toLowerCase().trim()
      const descr = normalizeText(item.descrizione).toLowerCase().trim()
      const aliquota = String(item.aliquota ?? '').trim().toLowerCase()
      const natura = String(item.natura ?? '').trim().toLowerCase()
      return (
        normalizedQuery === normalizeText(item.id).toLowerCase().trim() ||
        normalizedQuery === code ||
        normalizedQuery === descr ||
        normalizedQuery === label ||
        normalizedQuery === aliquota ||
        normalizedQuery === natura
      )
    })
  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) return exactMatches[0]

  const partialMatches = catalog
    .map(normalizeCausaleIvaCandidate)
    .filter((item) => {
      const label = buildCausaleLabel(item).toLowerCase().trim()
      const code = normalizeText(item.codice).toLowerCase().trim()
      const descr = normalizeText(item.descrizione).toLowerCase().trim()
      const aliquota = String(item.aliquota ?? '').trim().toLowerCase()
      const natura = String(item.natura ?? '').trim().toLowerCase()
      return (
        normalizeText(item.id).toLowerCase().includes(normalizedQuery) ||
        code.includes(normalizedQuery) ||
        descr.includes(normalizedQuery) ||
        label.includes(normalizedQuery) ||
        aliquota.includes(normalizedQuery) ||
        natura.includes(normalizedQuery) ||
        normalizedQuery.includes(code) ||
        normalizedQuery.includes(descr) ||
        normalizedQuery.includes(label)
      )
    })

  if (partialMatches.length === 1) return partialMatches[0]
  return partialMatches[0] || null
}

function resolveRowCausaleCandidate(row = {}, fallbackCandidate = null, causaliIva = []) {
  const source = row && typeof row === 'object' ? row : {}
  const direct = normalizeCausaleIvaCandidate(source)
  const query = normalizeText(source.causaleIvaQuery || source.causale_iva_query)
  const candidates = [direct]
  if (query) candidates.unshift(resolveCatalogCandidate(query, causaliIva))
  if (source.causaleIvaId || source.causaleIvaCodice || source.causaleIvaDescrizione || source.causaleIvaLabel || source.causaleIva || source.causale_iva) {
    const resolved = resolveCatalogCandidate(
      source.causaleIvaId || source.causaleIvaCodice || source.causaleIvaLabel || source.causaleIvaDescrizione || source.causaleIva || source.causale_iva,
      causaliIva
    )
    candidates.unshift(resolved)
  }
  const found = candidates.find((item) => item && (item.id || item.codice || item.descrizione))
  return found || fallbackCandidate || null
}

function createDefaultRow(index = 0, fallback = {}) {
  return normalizeRegistrazioneIvaRows([
    {
      id: `iva-row-${index + 1}`,
      riga: index + 1,
      ...fallback,
      attiva: true,
    },
  ], fallback)[0]
}

export function buildRegistrazioneIvaRows({
  rows = [],
  documentData = {},
  header = {},
  causaliIva = [],
  causaleContabile = null,
  causaleBehavior = {},
  baseCausale = null,
} = {}) {
  const normalizedRows = normalizeRegistrazioneIvaRows(rows, baseCausale || {})
  const sourceRows = normalizedRows.length ? normalizedRows : [createDefaultRow(0, baseCausale || {})]
  const documentTotal = round2(
    Number(
      normalizeText(documentData.totaleDocumento || documentData.totale_documento || header.totaleDocumento || header.totale_documento || 0)
        .replace(',', '.')
    ) || 0
  )
  const generatedRows = []
  const warnings = []
  const reasons = []
  let runningTotal = 0

  if (!sourceRows.length) {
    return {
      rows: [],
      source: 'none',
      warnings: ['Nessuna riga IVA disponibile'],
      reasons: ['Nessuna riga IVA disponibile'],
      summary: {
        imponibile: 0,
        ivaTotale: 0,
        ivaDetratta: 0,
        ivaIndetraibile: 0,
        totaleDocumento: documentTotal,
        residualDocumento: documentTotal,
      },
    }
  }

  sourceRows.forEach((row, index) => {
    const fallbackCandidate = resolveRowCausaleCandidate(row, baseCausale, causaliIva)
    const rowBehavior = resolveRegistrazioneCausaleIvaBehavior({
      causaleIva: fallbackCandidate,
      causaleContabile,
      causaleBehavior,
      documentData,
    })
    const effectiveRowBehavior = {
      ...rowBehavior,
      aliquota: Number.isFinite(Number(rowBehavior?.aliquota)) && Number(rowBehavior.aliquota) > 0 ? Number(rowBehavior.aliquota) : Number(fallbackCandidate?.aliquota || row.aliquota || 0),
      registroIva: rowBehavior?.registroIva || fallbackCandidate?.registroIva || 'da assegnare',
      segnoRegistro: rowBehavior?.segnoRegistro || fallbackCandidate?.segnoRegistro || '+',
      percentualeDetraibilita: Number.isFinite(Number(rowBehavior?.percentualeIndetraibilita))
        ? Math.max(0, 100 - Number(rowBehavior.percentualeIndetraibilita))
        : Number.isFinite(Number(fallbackCandidate?.percentualeIndetraibilita))
          ? Math.max(0, 100 - Number(fallbackCandidate.percentualeIndetraibilita))
          : Number.isFinite(Number(rowBehavior?.percentualeDetraibilita))
            ? Number(rowBehavior.percentualeDetraibilita)
            : Number.isFinite(Number(fallbackCandidate?.percentualeDetraibilita))
              ? Number(fallbackCandidate.percentualeDetraibilita)
              : 100,
      detraibile: rowBehavior?.detraibile ?? true,
      natura: rowBehavior?.natura || fallbackCandidate?.natura || '',
    }

    const calc = calculateRegistrazioneIvaRow({
      row,
      causaleIvaBehavior: effectiveRowBehavior,
      changedField: row.lastEditedField,
      documentTotal,
      previousRows: generatedRows,
      manualOverrides: row,
    })

    const residualAfterRow = round2(Math.max(0, documentTotal - round2(runningTotal + calc.totale)))
    const label = buildCausaleLabel(fallbackCandidate) || row.causaleIvaLabel || row.causaleIvaQuery || 'da selezionare'

    const policy = buildCausaleContabilePolicy(causaleContabile)
    const nextRow = {
      ...row,
      id: row.id || `iva-row-${index + 1}`,
      riga: Number.isFinite(Number(row.riga)) ? Number(row.riga) : index + 1,
      causaleIvaId: fallbackCandidate?.id || row.causaleIvaId || '',
      causaleIvaCodice: fallbackCandidate?.codice || row.causaleIvaCodice || '',
      causaleIvaDescrizione: fallbackCandidate?.descrizione || row.causaleIvaDescrizione || '',
      causaleIvaLabel: label,
      causaleIva: label,
      imponibile: calc.imponibile,
      ivaTotale: calc.ivaTotale,
      ivaDetratta: calc.ivaDetratta,
      ivaDetraibile: calc.ivaDetraibile,
      ivaIndetraibile: calc.ivaIndetraibile,
      totale: row.manualTotalCleared && !normalizeText(row.totale) ? '' : calc.totale,
      totaleDocumento: documentTotal,
      aliquota: calc.aliquota,
      natura: fallbackCandidate?.natura || row.natura || row.naturaIva || '',
      percentualeDetraibilita: calc.percentualeDetraibilita,
      percentualeIndetraibilita: row.percentualeIndetraibilita ?? Math.max(0, 100 - calc.percentualeDetraibilita),
      competenzaIva: row.competenzaIva || row.dataCompetenza || header.dataRegistrazione || '',
      dataOperazione: row.dataOperazione || header.dataRegistrazione || '',
      registroIva: resolveMeaningfulText(row.registroIva, rowBehavior.registroIva || fallbackCandidate?.registroIva || 'da assegnare'),
      segnoRegistro: row.segnoRegistro || rowBehavior.segnoRegistro || '+',
      protocolloProvvisorio: row.protocolloProvvisorio || 'da assegnare',
      protocolloDefinitivo: row.protocolloDefinitivo || 'da assegnare',
      stato: row.manualEdited ? 'manuale' : row.stato || 'predisposto',
      warnings: Array.from(new Set([...(row.warnings || []), ...(calc.warnings || []), ...(fallbackCandidate ? [] : ['Causale IVA non selezionata su riga IVA'])])),
      reasons: Array.from(new Set([...(row.reasons || []), ...(fallbackCandidate ? [] : ['Riga IVA predisposta in assenza di causale selezionata'])])),
      source: fallbackCandidate ? 'selected' : 'manual',
      documentResidual: residualAfterRow,
      manualTotalOverride: Boolean(row.manualTotalOverride),
      manualTotalCleared: Boolean(row.manualTotalCleared),
      manualImponibileOverride: Boolean(row.manualImponibileOverride),
      manualIvaDetrattaOverride: Boolean(row.manualIvaDetrattaOverride),
      manualIvaIndetraibileOverride: Boolean(row.manualIvaIndetraibileOverride),
      autoResidualApplied: Boolean(
        !row.manualTotalOverride &&
          !row.manualImponibileOverride &&
          !row.manualIvaDetrattaOverride &&
          !row.manualIvaIndetraibileOverride &&
          calc.source === 'residual'
      ),
      manualEdited: Boolean(row.manualEdited),
      lastEditedField: normalizeText(row.lastEditedField),
      attiva: row.attiva !== false,
      esigibilita: row.esigibilita || (policy.ivaPerCassa ? 'differita' : 'immediata'),
      origin_registro_iva_id: row.origin_registro_iva_id || row.originRegistroIvaId || null,
      ivaPerCassa: Boolean(row.ivaPerCassa || policy.ivaPerCassa),
    }

    generatedRows.push(nextRow)
    runningTotal = round2(runningTotal + calc.totale)
    warnings.push(...(nextRow.warnings || []))
    reasons.push(...(nextRow.reasons || []))
  })

  const summary = generatedRows.reduce(
    (acc, row) => ({
      imponibile: round2(acc.imponibile + Number(row.imponibile || 0)),
      ivaTotale: round2(acc.ivaTotale + Number(row.ivaTotale || 0)),
      ivaDetratta: round2(acc.ivaDetratta + Number(row.ivaDetratta || 0)),
      ivaIndetraibile: round2(acc.ivaIndetraibile + Number(row.ivaIndetraibile || 0)),
      totaleDocumento: documentTotal,
      residualDocumento: round2(Math.max(0, documentTotal - (acc.totaleRighe + Number(row.totale || 0)))),
      totaleRighe: round2(acc.totaleRighe + Number(row.totale || 0)),
    }),
    { imponibile: 0, ivaTotale: 0, ivaDetratta: 0, ivaIndetraibile: 0, totaleDocumento: documentTotal, residualDocumento: documentTotal, totaleRighe: 0 }
  )

  if (Math.abs(summary.totaleRighe - documentTotal) > 0.01) {
    warnings.push('somma delle righe IVA diversa dal totale documento')
  }

  return {
    rows: generatedRows,
    source: normalizedRows.length ? 'rows' : 'fallback',
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    reasons: Array.from(new Set(reasons.filter(Boolean))),
    summary,
  }
}
