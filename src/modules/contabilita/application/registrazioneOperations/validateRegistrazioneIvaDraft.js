import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

export function validateRegistrazioneIvaDraft(draft = {}, options = {}) {
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : {}
  const ivaData = draft?.ivaData && typeof draft.ivaData === 'object' ? draft.ivaData : {}
  const rows = Array.isArray(ivaData.rows) && ivaData.rows.length ? ivaData.rows : [ivaData]
  const blockers = []
  const warnings = []
  const info = []

  if (!behavior?.showIvaPanel) {
    return { status: 'idle', blockers, warnings, info }
  }

  const totaleDocumento = toAmount(ivaData.totaleDocumento)
  const imponibileTotale = toAmount(ivaData.imponibile || ivaData.totaleImponibile)
  const impostaTotale = toAmount(ivaData.imposta || ivaData.totaleImposta)
  const ivaDetrattaTotale = toAmount(ivaData.ivaDetratta || ivaData.ivaDetraibile)
  const ivaIndetraibileTotale = toAmount(ivaData.ivaIndetraibile)
  const percentualeDetraibilita = Number(ivaData.percentualeDetraibilita ?? 100)
  const percentualeIndetraibilita = Number(ivaData.percentualeIndetraibilita ?? Math.max(0, 100 - percentualeDetraibilita))

  let sommeRighe = { imponibile: 0, imposta: 0, ivaDetratta: 0, ivaIndetraibile: 0, totale: 0 }

  rows.forEach((row, index) => {
    const causaleIvaId = normalizeText(row?.causaleIvaId || row?.causale_iva_id)
    const causaleIvaCodice = normalizeText(row?.causaleIvaCodice || row?.causale_iva_codice)
    const registroIva = normalizeText(row?.registroIva || row?.registro_iva)
    const dataCompetenza = normalizeText(row?.competenzaIva || row?.dataCompetenza || row?.data_competenza)
    const dataOperazione = normalizeText(row?.dataOperazione || row?.data_operazione)
    const protocolloProvvisorio = normalizeText(row?.protocolloProvvisorio)
    const protocolloDefinitivo = normalizeText(row?.protocolloDefinitivo)
    const imponibile = toAmount(row?.imponibile || row?.totaleImponibile)
    const imposta = toAmount(row?.ivaTotale || row?.imposta || row?.totaleImposta)
    const ivaDetratta = toAmount(row?.ivaDetratta || row?.ivaDetraibile)
    const ivaIndetraibile = toAmount(row?.ivaIndetraibile)
    const totaleRiga = toAmount(row?.totale || row?.totaleDocumento)
    const percentualeDetraibilitaRiga = Number(row?.percentualeDetraibilita ?? percentualeDetraibilita)
    const percentualeIndetraibilitaRiga = Number(row?.percentualeIndetraibilita ?? Math.max(0, 100 - percentualeDetraibilitaRiga))

    if (!causaleIvaId && !causaleIvaCodice) {
      warnings.push(`causale IVA non selezionata sulla riga ${index + 1}`)
    } else if (!registroIva || registroIva.toLowerCase() === 'da assegnare') {
      warnings.push(`registro IVA non definito sulla riga ${index + 1}`)
    }
    if (behavior?.requiresIvaData && !dataCompetenza) warnings.push(`data competenza IVA mancante sulla riga ${index + 1}`)
    if (behavior?.requiresIvaData && !dataOperazione) warnings.push(`data operazione IVA mancante sulla riga ${index + 1}`)
    if (protocolloProvvisorio && protocolloProvvisorio.toLowerCase() !== 'da assegnare') info.push(`protocollo provvisorio già assegnato sulla riga ${index + 1}`)
    if (protocolloDefinitivo && protocolloDefinitivo.toLowerCase() !== 'da assegnare') info.push(`protocollo definitivo già assegnato sulla riga ${index + 1}`)
    if (imposta > 0 && Math.abs((ivaDetratta + ivaIndetraibile) - imposta) > 0.01) warnings.push(`quota IVA detratta/indetraibile incoerente con l imposta totale sulla riga ${index + 1}`)
    if (percentualeDetraibilitaRiga < 0 || percentualeDetraibilitaRiga > 100 || percentualeIndetraibilitaRiga < 0 || percentualeIndetraibilitaRiga > 100) warnings.push(`percentuale detraibilita IVA fuori range sulla riga ${index + 1}`)
    if (imponibile < 0 || imposta < 0 || ivaDetratta < 0 || ivaIndetraibile < 0 || totaleRiga < 0) blockers.push(`importi IVA negativi non ammessi sulla riga ${index + 1}`)

    sommeRighe = {
      imponibile: sommeRighe.imponibile + imponibile,
      imposta: sommeRighe.imposta + imposta,
      ivaDetratta: sommeRighe.ivaDetratta + ivaDetratta,
      ivaIndetraibile: sommeRighe.ivaIndetraibile + ivaIndetraibile,
      totale: sommeRighe.totale + totaleRiga,
    }
  }
)

  const hasSelectedCausaleIva = normalizeText(ivaData.causaleIvaId || ivaData.causale_iva_id || rows[0]?.causaleIvaId || rows[0]?.causale_iva_id) || normalizeText(ivaData.causaleIvaCodice || ivaData.causale_iva_codice || rows[0]?.causaleIvaCodice || rows[0]?.causale_iva_codice)

  if (!hasSelectedCausaleIva) {
    warnings.push('causale IVA non selezionata')
  } else if (!normalizeText(ivaData.registroIva || ivaData.registro_iva || rows[0]?.registroIva || rows[0]?.registro_iva) || normalizeText(ivaData.registroIva || ivaData.registro_iva || rows[0]?.registroIva || rows[0]?.registro_iva).toLowerCase() === 'da assegnare') {
    warnings.push('registro IVA non definito sulla causale IVA')
  }
  if (behavior?.requiresIvaData && !normalizeText(ivaData.dataCompetenza || rows[0]?.competenzaIva || rows[0]?.dataCompetenza)) warnings.push('data competenza IVA mancante')
  if (behavior?.requiresIvaData && !normalizeText(ivaData.dataOperazione || rows[0]?.dataOperazione)) warnings.push('data operazione IVA mancante')
  if (behavior?.requiresDocumentTotal && !totaleDocumento) warnings.push('totale documento IVA non compilato')
  if (!sommeRighe.imponibile && !sommeRighe.imposta) info.push('dati IVA predisposti, in attesa di compilazione manuale')
  if (normalizeText(ivaData.protocolloProvvisorio || rows[0]?.protocolloProvvisorio) && normalizeText(ivaData.protocolloProvvisorio || rows[0]?.protocolloProvvisorio).toLowerCase() !== 'da assegnare') info.push('protocollo provvisorio già assegnato')
  if (normalizeText(ivaData.protocolloDefinitivo || rows[0]?.protocolloDefinitivo) && normalizeText(ivaData.protocolloDefinitivo || rows[0]?.protocolloDefinitivo).toLowerCase() !== 'da assegnare') info.push('protocollo definitivo già assegnato')
  if (sommeRighe.imposta > 0 && Math.abs((sommeRighe.ivaDetratta + sommeRighe.ivaIndetraibile) - sommeRighe.imposta) > 0.01) warnings.push('quota IVA detratta/indetraibile incoerente con l imposta totale')
  if (percentualeDetraibilita < 0 || percentualeDetraibilita > 100 || percentualeIndetraibilita < 0 || percentualeIndetraibilita > 100) warnings.push('percentuale detraibilita IVA fuori range')
  if (imponibileTotale < 0 || impostaTotale < 0 || ivaDetrattaTotale < 0 || ivaIndetraibileTotale < 0 || totaleDocumento < 0) blockers.push('importi IVA negativi non ammessi')
  if (Math.abs(sommeRighe.totale - totaleDocumento) > 0.01 && totaleDocumento > 0) warnings.push('somma totale righe IVA diversa dal totale documento')

  const uniqueBlockers = Array.from(new Set(blockers.filter(Boolean)))
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)))
  const uniqueInfo = Array.from(new Set(info.filter(Boolean)))
  const status = uniqueBlockers.length ? 'blocked' : uniqueWarnings.length ? 'warning' : 'ok'

  return {
    status,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    info: uniqueInfo,
  }
}
