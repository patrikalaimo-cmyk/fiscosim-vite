import { sb } from '../../lib/supabase'
import { traceStep, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'

export async function insertDocumento(data) {
  traceIva('PRE_INSERT_DOCUMENTI_CONT', 'DB', data?.causale_iva_id ?? null)
  traceStep('INSERT_PAYLOAD', data, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(data) })
  const ins = await sb.from('documenti_contabilita').insert([data]).select()
  traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: ins.data, error: ins.error })
  if (ins.error) throw ins.error
  return ins.data?.[0]?.id ?? null
}

