/**
 * applyGuidedImportEventToStatementAudit
 *
 * Aggiunge un evento al guidedImportAudit dello staging corrente
 * e ricalcola il summary.
 *
 * Restituisce un nuovo bankStatement con guidedImportAudit aggiornato.
 * NON modifica movimenti, NON modifica altri campi.
 */

import { reduceGuidedImportAuditSummary } from './reduceGuidedImportAuditSummary.js'

export function applyGuidedImportEventToStatementAudit(bankStatement, event) {
  if (!bankStatement) return bankStatement
  if (!event) return bankStatement

  const existingAudit = bankStatement.guidedImportAudit || {}
  const existingEvents = Array.isArray(existingAudit.events) ? existingAudit.events : []

  const nextEvents = [...existingEvents, event]
  const nextSummary = reduceGuidedImportAuditSummary(nextEvents)

  const nextAudit = {
    ...existingAudit,
    events: nextEvents,
    summary: nextSummary,
  }

  return {
    ...bankStatement,
    guidedImportAudit: nextAudit,
    guidedImportAuditSummary: nextSummary,
    guidedImportAuditEvents: nextEvents,
  }
}

export function applyMultipleGuidedImportEventsToStatementAudit(bankStatement, events) {
  if (!bankStatement) return bankStatement
  if (!Array.isArray(events) || events.length === 0) return bankStatement

  const existingAudit = bankStatement.guidedImportAudit || {}
  const existingEvents = Array.isArray(existingAudit.events) ? existingAudit.events : []

  const nextEvents = [...existingEvents, ...events]
  const nextSummary = reduceGuidedImportAuditSummary(nextEvents)

  const nextAudit = {
    ...existingAudit,
    events: nextEvents,
    summary: nextSummary,
  }

  return {
    ...bankStatement,
    guidedImportAudit: nextAudit,
    guidedImportAuditSummary: nextSummary,
    guidedImportAuditEvents: nextEvents,
  }
}

export default applyGuidedImportEventToStatementAudit
