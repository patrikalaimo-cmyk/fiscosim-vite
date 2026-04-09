import { sb } from '../../lib/supabase'
import { traceStep, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'
import { syncPercipienteFromDocumentoContabilita } from '../contabilita/application/percipientiRegistryService.js'

export async function insertDocumento(data) {
  traceIva('PRE_INSERT_DOCUMENTI_CONT', 'DB', data?.causale_iva_id ?? null)
  traceStep('INSERT_PAYLOAD', data, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(data) })
  const ins = await sb.from('documenti_contabilita').insert([data]).select()
  traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: ins.data, error: ins.error })
  if (ins.error) throw ins.error
  if (ins.data?.[0]) {
    try {
      await syncPercipienteFromDocumentoContabilita(ins.data[0])
    } catch (e) {
      console.warn('[Percipienti sync] import_nuovo', e?.message || e)
    }
  }
  return ins.data?.[0]?.id ?? null
}
