export const STAGING_STATES = Object.freeze({
  imported: 'imported',
  review_pending: 'review_pending',
  ready_commit: 'ready_commit',
  committed: 'committed',
  error: 'error',
})

export function createEmptyStagingRow() {
  return {
    id: '',
    batchId: '',
    sourceHash: '',
    filename: '',
    parsedDocument: null,
    state: STAGING_STATES.imported,
    blockingErrors: [],
    warnings: [],
    userNotes: '',
    createdAt: '',
    updatedAt: '',
  }
}
