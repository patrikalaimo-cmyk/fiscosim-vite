import { saveOperatorCorrectionsMemory } from '../../../services/operatorCorrectionsMemoryService.js'

export async function saveOperatorCorrectionsHandler({ body }) {
  const documentId = body?.documentId
  const parsingAfter = body?.parsingAfter
  const accountingAfter = body?.accountingAfter ?? {}
  if (!documentId) return { status: 400, json: { error: 'documentId mancante' } }

  const result = await saveOperatorCorrectionsMemory({
    documentId,
    parsingAfter,
    accountingAfter,
    deps: { log: (e, p) => console.log(e, p) },
  })

  return { status: 200, json: result }
}
