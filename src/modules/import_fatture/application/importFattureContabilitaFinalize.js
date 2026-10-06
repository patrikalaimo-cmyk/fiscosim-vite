/**
 * Ponte finale Import Fatture → stesso binario Contabilità (`confirmDocumento` + `registraDocumentiConfermati`).
 * Nessuna logica PN duplicata qui.
 */

import { registraDocumentiConfermati } from '../../contabilita/application/contabilitaRegistrationWorkflow.js'
import * as contabilitaRepo from '../../contabilita/data/contabilitaRepo.js'

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   alreadyRegistered?: boolean,
 *   message?: string,
 *   primaNotaId?: string | null,
 *   documento?: object | null,
 *   registrati?: number,
 *   warnings?: unknown[],
 * }>}
 */
export async function confermaERegistraDocumentoContabilitaDaArchivio({
  archivioDocumentoId,
  societaId,
  utente,
  pianoConti,
  causaliContabili,
  causaliIva,
  clienti,
  trace,
  traceStep,
  traceDiff,
  traceIva,
  insertCausaleIvaMeta,
}) {
  const uid = utente?.id || ''
  const { data: doc0, error: e0 } = await contabilitaRepo.getDocumentoContabilitaById(archivioDocumentoId, societaId, {
    userId: uid,
  })
  if (e0) return { ok: false, message: e0.message || String(e0) }
  if (!doc0?.id) return { ok: false, message: 'Documento archivio non trovato o non accessibile.' }

  const ws = String(doc0.workflow_status || '').trim()
  const registered =
    ws === 'registered' || Boolean(doc0.prima_nota_id || doc0.registered_at)
  if (registered) {
    return {
      ok: true,
      alreadyRegistered: true,
      documento: doc0,
      primaNotaId: doc0.prima_nota_id || null,
      message: 'Documento già registrato in prima nota.',
    }
  }

  if (String(doc0.validation_status || '') !== 'confirmed') {
    const cr = await contabilitaRepo.confirmDocumento(doc0.id, new Date().toISOString(), societaId)
    if (cr?.error) {
      return { ok: false, message: cr.error.message || String(cr.error) }
    }
  }

  const { data: doc1, error: e1 } = await contabilitaRepo.getDocumentoContabilitaById(archivioDocumentoId, societaId, {
    userId: uid,
  })
  if (e1) return { ok: false, message: e1.message || String(e1) }
  if (!doc1?.id) return { ok: false, message: 'Documento non trovato dopo la conferma.' }

  const result = await registraDocumentiConfermati({
    documenti: [doc1],
    societaId,
    utente,
    pianoConti,
    causaliContabili,
    causaliIva,
    clienti,
    updateDocumento: (id, updates) => contabilitaRepo.updateDocumentoContabilita(id, updates),
    trace,
    traceStep,
    traceDiff,
    traceIva,
    insertCausaleIvaMeta,
  })

  const err = Array.isArray(result.errors) ? result.errors.find((x) => String(x?.docId) === String(doc1.id)) : null
  if (err) {
    return {
      ok: false,
      message: typeof err.error === 'string' ? err.error : err.error?.message || 'Errore durante la registrazione',
    }
  }

  const { data: doc2 } = await contabilitaRepo.getDocumentoContabilitaById(archivioDocumentoId, societaId, {
    userId: uid,
  })

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fiscosim:contabilita-refresh', { detail: { source: 'import_fatture_registrazione' } }))
  }

  return {
    ok: true,
    alreadyRegistered: false,
    documento: doc2 || doc1,
    primaNotaId: doc2?.prima_nota_id || null,
    registrati: result.registrati,
    warnings: result.warnings,
  }
}
