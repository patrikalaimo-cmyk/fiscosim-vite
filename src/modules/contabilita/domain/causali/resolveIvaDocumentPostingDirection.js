import { normalizeText } from '../../application/canonical_mapper/utils.js'

/**
 * Risolve la direzione di registrazione Dare/Avere delle righe per i documenti IVA.
 * Basa la logica primaria sulle impostazioni della causale (registro_iva, segno_registro_iva).
 * Usa il codice causale solo come fallback residuale.
 * 
 * @param {Object} causalePolicy - La policy causale ottenuta da buildCausaleContabilePolicy
 * @returns {Object} 
 */
export function resolveIvaDocumentPostingDirection(causalePolicy) {
  // Verifichiamo se la policy ha già categorizzato in modo pulito il tipo di documento
  // tramite buildCausaleContabilePolicy
  let isAcquisti = causalePolicy?.isFatturaPassiva === true || causalePolicy?.isNotaCreditoPassiva === true
  let isVendite = causalePolicy?.isFatturaAttiva === true || causalePolicy?.isNotaCreditoAttiva === true

  const reg = String(causalePolicy?.registroIva || '').trim().toLowerCase()
  const segno = String(causalePolicy?.segnoRegistroIva || '').trim().toLowerCase()

  // Se non è stato possibile classificarlo tramite i flag espliciti della policy,
  // interpretiamo i metadati di registro
  if (!isAcquisti && !isVendite) {
    if (reg === 'acquisti' || reg === '01' || reg.includes('acq') || reg.includes('acquisto')) {
      isAcquisti = true
    } else if (reg === 'vendite' || reg === '02' || reg.includes('ven') || reg.includes('vendita')) {
      isVendite = true
    }
  }

  // Se mancano ancora i metadati a DB, facciamo un fallback tecnico basato su codice causale
  if (!isAcquisti && !isVendite) {
    const code = String(causalePolicy?.code || '').trim().toUpperCase()
    // [Technical Fallback Residual]
    if (code.startsWith('FF') || code.includes('ACQ') || code.startsWith('NCF')) {
      isAcquisti = true
    } else if (code.startsWith('FC') || code.includes('VEN') || code.startsWith('NC') || code.startsWith('NCC')) {
      isVendite = true
    }
  }

  // Identificazione segno registro (Sottrae vs Somma)
  let isSottrae = segno === 'sottrae' || segno === '-' || segno === 'sottrazione' || causalePolicy?.notaCredito === true

  // Fallback residuale segno basato su codice se non impostato
  if (segno === '' && !causalePolicy?.notaCredito) {
    const code = String(causalePolicy?.code || '').trim().toUpperCase()
    // [Technical Fallback Residual]
    if (code.startsWith('NC') || code.startsWith('NCC') || code.startsWith('NCF') || code === 'NCA') {
      isSottrae = true
    }
  }

  const registroKind = isAcquisti ? 'acquisti' : (isVendite ? 'vendite' : null)
  const segnoRegistro = isSottrae ? 'sottrae' : 'somma'
  const registroSign = isSottrae ? -1 : 1

  let subjectSide = 'dare'
  let vatSide = 'avere'
  let imputationSide = 'avere'

  if (isAcquisti) {
    if (isSottrae) {
      // Nota credito fornitore (NCF)
      subjectSide = 'dare'
      vatSide = 'avere'
      imputationSide = 'avere'
    } else {
      // Fattura fornitore ordinaria (FF)
      subjectSide = 'avere'
      vatSide = 'dare'
      imputationSide = 'dare'
    }
  } else {
    // Registro vendite o default (FC, NC, NCC)
    if (isSottrae) {
      // Nota credito cliente (NC)
      subjectSide = 'avere'
      vatSide = 'dare'
      imputationSide = 'dare'
    } else {
      // Fattura cliente ordinaria (FC)
      subjectSide = 'dare'
      vatSide = 'avere'
      imputationSide = 'avere'
    }
  }

  return {
    registroKind,
    segnoRegistro,
    subjectSide,
    vatSide,
    imputationSide,
    registroSign
  }
}
