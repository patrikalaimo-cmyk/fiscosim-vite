export const REPORT_OUTCOMES = Object.freeze({
  imported: 'imported',
  blocked_duplicate: 'blocked_duplicate',
  blocked_accounted: 'blocked_accounted',
  warning_reimport: 'warning_reimport',
  parse_error: 'parse_error',
})

export function createEmptyReport() {
  return {
    batchId: '',
    startedAt: '',
    finishedAt: '',
    totals: {
      files: 0,
      imported: 0,
      blocked: 0,
      warnings: 0,
      errors: 0,
    },
    items: [],
    warnings: [],
    errors: [],
    deletedDetectionNote:
      'I casi cancellati sono rilevati solo se ancora presenti nello storico/stato DB. I record eliminati fisicamente non sono distinguibili da documenti mai importati.',
    duplicateInStagingCount: 0,
    duplicateInAccountingCount: 0,
    deletedInStagingCount: 0,
    deletedInAccountingCount: 0,
    duplicateInStagingRows: [],
    duplicateInAccountingRows: [],
    deletedInStagingRows: [],
    deletedInAccountingRows: [],
  }
}
