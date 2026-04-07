import { buildParsingSnapshotFromImportForm, buildAccountingSnapshotFromImportForm } from '../../../shared/utils/operatorCorrectionsSnapshots.js'
import { postOperatorCorrections } from './importAiClient.js'

export async function saveImportOperatorCorrections({ documentId, form, tipo, pianoConti }) {
  const parsingAfter = buildParsingSnapshotFromImportForm(form, tipo)
  const accountingAfter = buildAccountingSnapshotFromImportForm(form, pianoConti)
  return postOperatorCorrections({ documentId, parsingAfter, accountingAfter })
}

