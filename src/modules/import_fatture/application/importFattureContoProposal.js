/**
 * Proposta conto per Import Fatture (staging): riusa la stessa catena di Import Documenti
 * (match controparte su piano → storico opzionale → suggerimenti testo/AI), senza duplicare motori paralleli.
 */

import * as importRepo from '../../import_unificato/data/importRepo.js'
import { resolveImportCounterpartyMatch } from '../../../../domain/importCounterpartyMatch.js'
import { suggestContiPerDocumento } from '../../../shared/utils/pianoContiSuggestions.js'

const META = importRepo.FISCOSIM_IMPORT_AI_META

function parseAiRawRoot(doc) {
  const raw = doc?.ai_raw_response
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p && !Array.isArray(p) ? { ...p } : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readAccountingProposals(doc) {
  const raw = parseAiRawRoot(doc)
  const bag = raw[META.ACCOUNTING_PROPOSALS]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

/** Stesso schema di `ImportDocumentCard` / `documenti_import` con dati solo in `ai_raw_response`. */
export function buildDocSnapshotForContoMatch(doc = {}) {
  const raw = parseAiRawRoot(doc)
  const tipo = String(doc.tipo_documento || raw.tipo_documento || 'fattura_passiva').toLowerCase()
  const isAttiva = tipo.includes('attiva')
  return {
    ...doc,
    tipo_documento: doc.tipo_documento || raw.tipo_documento,
    soggetto_piva: doc.soggetto_piva || (isAttiva ? raw.cessionario_piva : raw.cedente_piva) || '',
    soggetto_cf: doc.soggetto_cf || (isAttiva ? raw.cessionario_cf : raw.cedente_cf) || '',
    soggetto_denominazione:
      doc.soggetto_denominazione || (isAttiva ? raw.cessionario_denom : raw.cedente_denom) || '',
  }
}

/**
 * Conto economico proposto in sola lettura: valore salvato in `_fiscosimAccountingProposals`, altrimenti
 * stessa priorità operativa di Import Documenti (contropartita piano con conto predefinito → storico → AI).
 *
 * @param {Record<string, unknown>} doc riga `documenti_import`
 * @param {unknown[]} pianoConti
 * @param {string} [historicalTopCodice] primo conto dallo storico confermato (stessa controparte), se già calcolato
 * @returns {string} codice conto o stringa vuota
 */
export function pickImportFatturaStagingContoCodice(doc, pianoConti = [], historicalTopCodice = '') {
  const saved = String(readAccountingProposals(doc).conto_codice ?? '').trim()
  if (saved) return saved

  const snap = buildDocSnapshotForContoMatch(doc)
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const m = resolveImportCounterpartyMatch({ doc: snap, pianoConti: list })
  if (!m.ambiguous) {
    const costCod = String(m.costConto?.codice ?? '').trim()
    if (costCod) return costCod
    const supCod = String(m.supplierConto?.codice ?? '').trim()
    if (supCod) return supCod
  }

  const hist = String(historicalTopCodice ?? '').trim()
  if (hist) return hist

  const aiList = suggestContiPerDocumento({ doc: snap, pianoConti: list, maxResults: 1 })
  const aiCod = String(aiList?.[0]?.codice ?? '').trim()
  if (aiCod) return aiCod

  return ''
}
