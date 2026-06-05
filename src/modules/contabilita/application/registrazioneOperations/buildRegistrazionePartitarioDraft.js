import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { calculateRegistrazionePartitarioSelection } from './calculateRegistrazionePartitarioSelection.js'
import { validateRegistrazionePartitarioDraft } from './validateRegistrazionePartitarioDraft.js'
import { resolvePartitaSoggettoId } from './resolvePartitaSoggettoId.js'


function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function hasMeaningfulText(value) {
  return Boolean(normalizeText(value))
}

function resolveTipoDocumento(mode, currentDraft = {}, documentData = {}, header = {}, selectedCausale = null, behavior = {}) {
  const direct =
    currentDraft.tipoDocumento ||
    currentDraft.tipo_documento ||
    documentData.tipoDocumento ||
    documentData.tipo_documento ||
    header.tipoDocumento ||
    header.tipo_documento ||
    selectedCausale?.tipoDocumento ||
    selectedCausale?.tipo_documento ||
    behavior?.tipoDocumento ||
    behavior?.tipo_documento
  if (hasMeaningfulText(direct)) return normalizeText(direct)

  const selectedCode = normalizeText(selectedCausale?.codice || selectedCausale?.code || selectedCausale?.id).toUpperCase()
  if (selectedCode.startsWith('NC') || selectedCode.includes('NOTACREDITO')) return 'NC'
  if (selectedCode.startsWith('FF') || selectedCode.startsWith('FT') || selectedCode.includes('FATTURA')) return 'FT'

  const behaviorText = normalizeText(behavior?.documentMode || behavior?.label || selectedCausale?.descrizione || selectedCausale?.description || selectedCausale?.nome)
    .toLowerCase()
  if (behaviorText.includes('nota credito') || behaviorText.includes('nota di credito') || behaviorText.includes('nc')) return 'NC'
  if (behaviorText.includes('fattura') || behaviorText.includes('documento') || behaviorText.includes('invoice') || mode === 'apertura') return 'FT'
  return ''
}

function inferSign(mode, amount) {
  if (mode === 'apertura') return 'A'
  if (mode === 'chiusura') return amount < 0 ? 'D' : 'A'
  return amount < 0 ? 'D' : 'A'
}

function resolvePartitarioMode(behavior = {}, partitarioData = {}) {
  const behaviorMode = normalizeText(behavior?.partitarioMode || '').toLowerCase()
  const currentMode = normalizeText(partitarioData?.tipoMovimento || partitarioData?.tipo_movimento || '').toLowerCase()
  if (behaviorMode === 'chiusura' || behaviorMode.includes('chiusura')) return 'chiusura'
  if (behaviorMode === 'nessuno') return 'none'
  if (behaviorMode === 'legacy') return currentMode || 'apertura'
  if (behavior?.showPartitario) return currentMode === 'chiusura' ? 'chiusura' : 'apertura'
  return 'none'
}

export function buildRegistrazionePartitarioDraft(input = {}, options = {}) {
  const header = input?.header && typeof input.header === 'object' ? input.header : {}
  const documentData = input?.documentData && typeof input.documentData === 'object' ? input.documentData : {}
  const partitarioData = input?.partitarioData && typeof input.partitarioData === 'object' ? input.partitarioData : {}
  const openItems = Array.isArray(input?.openItems) ? input.openItems : Array.isArray(input?.partite) ? input.partite : []
  const currentPartitarioDraft = input?.currentPartitarioDraft && typeof input.currentPartitarioDraft === 'object' ? input.currentPartitarioDraft : partitarioData
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const selectedControparteId = normalizeText(header.clienteFornitoreId || header.cliente_fornitore_id)
  const selectedControparteNome = normalizeText(header.clienteFornitoreNome || header.cliente_fornitore_nome || header.soggetto)
  const tipoMovimento = resolvePartitarioMode(behavior, currentPartitarioDraft)
  const isApertura = tipoMovimento === 'apertura'
  const isChiusura = tipoMovimento === 'chiusura'
  const totaleDocumento = toAmount(documentData.totaleDocumento || header.totaleDocumento)
  const manualOpenOverride = Boolean(currentPartitarioDraft.manualImportoApertoOverride || currentPartitarioDraft.manual_importo_aperto_override)
  const manualCloseOverride = Boolean(currentPartitarioDraft.manualImportoChiusuraOverride || currentPartitarioDraft.manual_importo_chiusura_override)
  
  const rawSelectedPartitaIds = Array.isArray(currentPartitarioDraft.selectedPartitaIds)
    ? currentPartitarioDraft.selectedPartitaIds
    : currentPartitarioDraft.selectedPartitaId
      ? [currentPartitarioDraft.selectedPartitaId]
      : []
  const selectedPartitaIds = rawSelectedPartitaIds.map(x => String(x || '').trim())
  const importiChiusura = currentPartitarioDraft.importiChiusura && typeof currentPartitarioDraft.importiChiusura === 'object'
    ? currentPartitarioDraft.importiChiusura
    : {}

  const selection = calculateRegistrazionePartitarioSelection({
    partite: openItems,
    selectedPartitaId: currentPartitarioDraft.selectedPartitaId,
    importoChiusura: currentPartitarioDraft.importoChiusura,
  })
  const selectedPartita = selection.selectedPartita
  const subjectAccount = Array.isArray(options?.pianoConti)
    ? options.pianoConti.find((item) => String(item?.id || '').trim() === selectedControparteId)
    : null
  const isCustomer = Boolean(subjectAccount?.is_cliente)
  const isSupplier = Boolean(subjectAccount?.is_fornitore || subjectAccount?.is_professionista)
  const documentTotal =
    toAmount(documentData.totaleDocumento || documentData.totale_documento || header.totaleDocumento || header.totale_documento)
  const importoOrigine = isApertura
    ? documentTotal
    : selectedPartita
      ? selectedPartita.importoOrigine ?? selectedPartita.importo_origine ?? selectedPartita.importo_originale ?? selectedPartita.totale ?? 0
      : 0
  const importoAperto = isApertura
    ? (manualOpenOverride
        ? toAmount(currentPartitarioDraft.importoAperto)
        : documentTotal)
    : 0

  const openItemsMapped = isApertura
    ? []
    : openItems.map((item, index) => {
        const rawResiduo = item?.saldoResiduo ?? item?.saldo_residuo ?? item?.importo_residuo ?? item?.residuo ?? item?.saldo
        const rowResiduo = rawResiduo !== undefined && rawResiduo !== null ? toAmount(rawResiduo) : null
        
        const rawOriginale = item?.importoOrigine ?? item?.importo_origine ?? item?.importo_originale ?? item?.totale
        const importoOriginario = rawOriginale !== undefined && rawOriginale !== null ? toAmount(rawOriginale) : null
        
        const rawPagato = item?.importoPagato ?? item?.importo_pagato
        const importoPagato = rawPagato !== undefined && rawPagato !== null ? toAmount(rawPagato) : null

        const idStr = String(item?.id || '').trim()
        const isSelected = selectedPartitaIds.includes(idStr)
        
        let rowImportoChiusura = 0
        if (isSelected) {
          let rawVal = 0
          if (importiChiusura[idStr] !== undefined && importiChiusura[idStr] !== null && importiChiusura[idStr] !== '') {
            rawVal = toAmount(importiChiusura[idStr])
          } else if (idStr === String(currentPartitarioDraft.selectedPartitaId || '').trim() && currentPartitarioDraft.importoChiusura !== undefined && currentPartitarioDraft.importoChiusura !== '') {
            rawVal = toAmount(currentPartitarioDraft.importoChiusura)
          } else {
            rawVal = rowResiduo !== null ? rowResiduo : 0
          }
          
          // Coerce sign to match rowResiduo and cap overpayments in absolute value
          if (rowResiduo !== null && rowResiduo < 0) {
            rowImportoChiusura = -Math.abs(rawVal)
            if (Math.abs(rowImportoChiusura) > Math.abs(rowResiduo)) {
              rowImportoChiusura = rowResiduo
            }
          } else if (rowResiduo !== null) {
            rowImportoChiusura = Math.abs(rawVal)
            if (rowImportoChiusura > rowResiduo) {
              rowImportoChiusura = rowResiduo
            }
          } else {
            rowImportoChiusura = rawVal
          }
        }

        const itemSoggettoId = resolvePartitaSoggettoId(item) || selectedControparteId
        const itemAccount = Array.isArray(options?.pianoConti)
          ? options.pianoConti.find((pc) => String(pc?.id || '').trim() === String(itemSoggettoId || '').trim())
          : null
        const itemSoggettoNome = itemAccount?.nome || item?.soggettoNome || item?.soggetto_nome || selectedControparteNome
        const itemSoggettoTipo = itemAccount?.is_cliente ? 'cliente' : (itemAccount?.is_fornitore || itemAccount?.is_professionista) ? 'fornitore' : (item?.soggettoTipo || item?.soggetto_tipo || '')

        return {
          id: item?.id || `partita-${index + 1}`,
          riga: index + 1,
          tipoMovimento,
          conto_id: item?.conto_id || item?.contoId || itemSoggettoId,
          contoId: item?.contoId || item?.conto_id || itemSoggettoId,
          soggettoId: itemSoggettoId,
          soggettoNome: itemSoggettoNome,
          soggettoTipo: itemSoggettoTipo,
          numeroDocumento: normalizeText(item?.numeroDocumento || item?.numero_documento),
          dataDocumento: normalizeText(item?.dataDocumento || item?.data_documento),
          tipoDocumento: normalizeText(item?.tipoDocumento || item?.tipo_documento),
          importoOriginario,
          importoPagato,
          importoAperto: 0,
          importoChiusura: rowImportoChiusura,
          residuo: rowResiduo,
          segno: item?.segno || inferSign('chiusura', rowResiduo || 0),
          stato: normalizeText(item?.stato || 'aperta'),
          selected: isSelected,
        }
      })

  let netChiusura = 0
  let netResiduo = 0
  if (isChiusura) {
    openItemsMapped.forEach(r => {
      if (r.selected) {
        netChiusura += r.importoChiusura
        netResiduo += (r.residuo || 0)
      }
    })
  }

  const importoChiusura = isChiusura
    ? (manualCloseOverride
        ? toAmount(currentPartitarioDraft.importoChiusura)
        : Math.abs(netChiusura))
    : 0
  const residuo = isApertura ? importoAperto : netResiduo
  const segno = currentPartitarioDraft.segnoChiusura || inferSign(tipoMovimento, isApertura ? importoAperto : importoChiusura || selection.saldoResiduo)
  const aperturaSegno = isCustomer ? 'D' : isSupplier ? 'A' : segno
  const resolvedTipoDocumento = resolveTipoDocumento(tipoMovimento, currentPartitarioDraft, documentData, header, input?.selectedCausale, behavior)
  const numeroDocumento = normalizeText(
    isApertura
      ? currentPartitarioDraft.numeroDocumento || header.numeroDocumento
      : currentPartitarioDraft.selectedPartitaNumeroDocumento || selection.selectedPartita?.numeroDocumento || selection.selectedPartita?.numero_documento
  )
  const dataDocumento = normalizeText(
    isApertura
      ? currentPartitarioDraft.dataDocumento || header.dataDocumento || header.dataRegistrazione
      : currentPartitarioDraft.selectedPartitaDataDocumento || selection.selectedPartita?.dataDocumento || selection.selectedPartita?.data_documento
  )
  const tipoDocumento = normalizeText(
    isApertura
      ? resolvedTipoDocumento
      : currentPartitarioDraft.selectedPartitaTipoDocumento || selection.selectedPartita?.tipoDocumento || selection.selectedPartita?.tipo_documento
  )
  const stato = isApertura ? 'apertura_predisposta' : 'chiusura_predisposta'

  const draft = {
    active: Boolean(behavior.showPartitario),
    mode: tipoMovimento,
    tipoMovimento,
    selectedControparteId,
    selectedControparteNome,
    soggettoId: selectedControparteId,
    soggettoNome: selectedControparteNome,
    selectedPartitaId: normalizeText(currentPartitarioDraft.selectedPartitaId || selectedPartita?.id),
    selectedPartitaIds,
    importiChiusura,
    numeroDocumento,
    dataDocumento,
    tipoDocumento,
    importoOriginario: toAmount(importoOrigine),
    importoAperto: toAmount(importoAperto),
    importoChiusura,
    residuo: toAmount(residuo),
    segno,
    stato,
    selectedPartitaNumeroDocumento: numeroDocumento,
    selectedPartitaDataDocumento: dataDocumento,
    selectedPartitaTipoDocumento: tipoDocumento,
    selectedPartitaImportoOrigine: toAmount(importoOrigine),
    selectedPartitaSaldoResiduo: toAmount(residuo),
    selectedPartitaImportoChiusura: toAmount(importoChiusura),
    openItems,
    rows: isApertura
      ? [
          {
            id: 'partitario-row-1',
            riga: 1,
            tipoMovimento,
            soggettoId: selectedControparteId,
            soggettoNome: selectedControparteNome,
            soggettoTipo: isCustomer ? 'cliente' : isSupplier ? 'fornitore' : '',
            numeroDocumento,
            dataDocumento,
            tipoDocumento,
            importoOriginario: toAmount(importoOrigine),
            importoAperto: toAmount(importoAperto),
            importoChiusura: 0,
            residuo: toAmount(importoAperto),
            segno: aperturaSegno,
            stato,
            source: 'document_data',
          },
        ]
      : openItemsMapped,
    manualImportoApertoOverride: manualOpenOverride,
    manualImportoChiusuraOverride: manualCloseOverride,
  }

  const validation = validateRegistrazionePartitarioDraft({ header, documentData, partitarioData: draft, behavior }, { ...options, openItems })

  return {
    ...draft,
    validation,
    status: validation.status,
    warnings: validation.warnings,
    blockers: validation.blockers,
    info: validation.info,
    totals: {
      importoAperto: isApertura ? toAmount(importoAperto) : 0,
      importoChiusura: isChiusura ? toAmount(importoChiusura) : 0,
      residuo: toAmount(residuo),
      saldoResiduo: isChiusura ? Math.abs(netResiduo) : toAmount(residuo),
    },
  }
}
