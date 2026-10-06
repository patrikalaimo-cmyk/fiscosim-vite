/**
 * matchGuidedImportTemplate
 *
 * Cerca un template compatibile nel registry locale per uno statement importato.
 *
 * Criteri di match (score 0-1):
 * - bankName esatto: +0.40
 * - bankName parziale: +0.28
 * - bankName alias: +0.22
 * - IBAN prefix (10 char): +0.25
 * - BIC esatto: +0.15
 * - sourceProfile esatto: +0.15
 * - columnPreset match: +0.05
 *
 * Score >= 0.85 → high | 0.70-0.84 → medium | < 0.70 → no match
 */

import { loadGuidedImportTemplates } from './guidedImportTemplateStorage.js'

function normalizeBank(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractIbanPrefix(iban, length = 10) {
  return String(iban || '')
    .replace(/\s/g, '')
    .slice(0, length)
    .toUpperCase()
}

export function matchGuidedImportTemplate(statement, templates = null) {
  const allTemplates = templates || loadGuidedImportTemplates()

  if (!allTemplates.length) {
    return { matched: false, template: null, score: 0, reasons: [], warnings: [] }
  }

  const stmtBankName = normalizeBank(
    statement.documentAccount?.bankName ||
      statement.documentMeta?.bankName ||
      statement.bankName ||
      statement.profileLabel ||
      ''
  )

  const stmtIbanPrefix = extractIbanPrefix(
    statement.documentAccount?.iban ||
      statement.documentMeta?.iban ||
      statement.iban ||
      ''
  )

  const stmtBic = String(
    statement.documentAccount?.bic || statement.documentMeta?.bic || ''
  )
    .trim()
    .toUpperCase()

  const stmtProfile = String(statement.profile || '').trim()

  let bestMatch = null
  let bestScore = 0
  let bestReasons = []

  for (const tpl of allTemplates) {
    let score = 0
    const reasons = []

    // bankName match
    const tplBank = normalizeBank(tpl.bankName || '')
    if (tplBank && stmtBankName) {
      if (tplBank === stmtBankName) {
        score += 0.40
        reasons.push('bank_exact')
      } else if (
        tplBank.includes(stmtBankName) ||
        stmtBankName.includes(tplBank)
      ) {
        score += 0.28
        reasons.push('bank_partial')
      } else {
        const aliases = (tpl.bankAliases || []).map(normalizeBank)
        const aliasMatch = aliases.some(
          (alias) =>
            alias === stmtBankName ||
            alias.includes(stmtBankName) ||
            stmtBankName.includes(alias)
        )
        if (aliasMatch) {
          score += 0.22
          reasons.push('bank_alias')
        }
      }
    }

    // IBAN prefix
    if (stmtIbanPrefix && tpl.ibanPrefix) {
      const tplIban = extractIbanPrefix(tpl.ibanPrefix)
      if (
        stmtIbanPrefix.startsWith(tplIban.slice(0, 8)) ||
        tplIban.startsWith(stmtIbanPrefix.slice(0, 8))
      ) {
        score += 0.25
        reasons.push('iban_prefix')
      }
    }

    // BIC
    if (stmtBic && tpl.bic && stmtBic === tpl.bic) {
      score += 0.15
      reasons.push('bic_match')
    }

    // sourceProfile
    if (stmtProfile && tpl.sourceProfile && stmtProfile === tpl.sourceProfile) {
      score += 0.15
      reasons.push('profile_match')
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = tpl
      bestReasons = reasons
    }
  }

  // Round score to 2 decimals
  bestScore = Math.round(bestScore * 100) / 100

  if (bestScore < 0.70) {
    return {
      matched: false,
      template: null,
      score: bestScore,
      reasons: bestReasons,
      warnings: bestScore >= 0.40 ? ['score_below_threshold'] : [],
    }
  }

  return {
    matched: true,
    template: bestMatch,
    score: bestScore,
    scoreLevel: bestScore >= 0.85 ? 'high' : 'medium',
    reasons: bestReasons,
    warnings: [],
  }
}
