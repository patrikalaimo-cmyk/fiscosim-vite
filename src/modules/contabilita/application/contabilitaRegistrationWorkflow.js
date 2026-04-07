import { buildDocumentoContabilePrimaNotaPayload } from '../../../../domain/primaNotaPayloadBuilder.js'
import { createPrimaNotaCompleta } from '../../../../services/primaNotaService.js'

export async function registraDocumentiConfermati({
  documenti,
  societaId,
  pianoConti,
  causaliContabili,
  updateDocumento,
  trace,
  traceStep,
  traceDiff,
  traceIva,
  insertCausaleIvaMeta,
}) {
  const daRegistrare = (documenti || []).filter(
    (d) => d.validation_status === 'confirmed' && d.workflow_status !== 'registered'
  )

  if (!daRegistrare.length) return { registrati: 0, skipped: true }

  let registrati = 0
  for (const doc of daRegistrare) {
    try {
      const isPassiva = doc.tipo_documento?.includes('passiva')
      const isAttiva = doc.tipo_documento?.includes('attiva')

      // Find conto from doc
      const conto = doc.conto_id ? pianoConti.find((c) => c.id === doc.conto_id) : null

      // Find IVA account in piano conti
      const contoIva = pianoConti.find(
        (c) => c.is_iva && c.livello >= 3 && (isPassiva ? /credito/i.test(c.descrizione) : /debito/i.test(c.descrizione))
      )

      // Find fornitore/cliente account
      const contoControparte = doc.conto_id
        ? conto
        : pianoConti.find((c) => (isPassiva ? c.is_fornitore : c.is_cliente) && c.livello >= 4)

      // Generic cost/revenue if no specific conto assigned
      const contoCostoRicavo =
        conto ||
        (isPassiva
          ? pianoConti.find((c) => c.codice?.startsWith('4') && c.livello >= 3)
          : pianoConti.find((c) => c.codice?.startsWith('3') && c.livello >= 3))

      const causale = isPassiva
        ? causaliContabili.find((c) => /FF|fatt.*forn/i.test(c.codice + c.descrizione))
        : causaliContabili.find((c) => /FC|fatt.*cli/i.test(c.codice + c.descrizione))

      trace?.('DB', { action: 'INSERT prima_nota', doc_id: doc.id })
      const { pnPayload: pnInsertPayload, righePayload: righe, partEntries } =
        buildDocumentoContabilePrimaNotaPayload({
          doc,
          societaId,
          dataRegistrazione: doc.data_documento || new Date().toISOString().slice(0, 10),
          causaleCodice: causale?.codice,
          isPassiva,
          contoCostoRicavo,
          contoIva,
          contoControparte,
          stato: 'provvisoria',
        })

      traceIva?.('PRE_INSERT_PRIMA_NOTA_HEADER', 'DB', doc.causale_iva_id ?? null)
      traceStep?.(
        'INSERT_PAYLOAD',
        pnInsertPayload,
        { table: 'prima_nota', ...(insertCausaleIvaMeta ? insertCausaleIvaMeta(pnInsertPayload) : {}) }
      )
      traceDiff?.(
        'DB_MAPPING_DIFF',
        { causale_iva_id: doc.causale_iva_id ?? null },
        { causale_iva_id: pnInsertPayload.causale_iva_id ?? null }
      )

      if (righe.length > 0) {
        traceIva?.('PRE_INSERT_PRIMA_NOTA_RIGHE', 'DB', righe[0]?.causale_iva_id ?? doc.causale_iva_id ?? null)
        traceStep?.(
          'INSERT_PAYLOAD',
          righe,
          { table: 'prima_nota_righe', ...(insertCausaleIvaMeta ? insertCausaleIvaMeta(righe) : {}) }
        )
        traceDiff?.(
          'DB_MAPPING_DIFF',
          { causale_iva_id: doc.causale_iva_id ?? null },
          { causale_iva_id: righe[0]?.causale_iva_id ?? null }
        )
      }

      const complete = await createPrimaNotaCompleta({
        pnPayload: pnInsertPayload,
        righePayload: righe,
        partEntries,
        headerSelect: '*',
        righeSelect: '*',
        partitarioSelect: '*',
      })
      traceStep?.('INSERT_RESULT', { table: 'prima_nota', data: complete.pn, error: complete.error })
      traceStep?.(
        'INSERT_RESULT',
        { table: 'prima_nota_righe', data: complete.righeIns?.data, error: complete.righeIns?.error ?? complete.error }
      )
      if (complete.error) throw complete.error
      const pn = complete.pn

      await updateDocumento(doc.id, {
        workflow_status: 'registered',
        registered_at: new Date().toISOString(),
        prima_nota_id: pn.id,
      })

      registrati++
    } catch (err) {
      console.error('Registrazione error per doc', doc.id, err)
    }
  }

  return { registrati, skipped: false, total: daRegistrare.length }
}
