import { normalizeMockText } from './riconciliazioneMockSelectors.js'

/**
 * Scoring-based bank statement profile detection.
 *
 * Replaces the fragile priority-order approach with independent signal scoring
 * for each bank. Each signal has a weight; the winner must either hold at least
 * one strong exclusive signal OR outscore the other with weak-signal margin.
 *
 * Profiles returned:
 *   banca_sella_statement_v1            — Banca Sella
 *   banco_sardegna_monthly_services_v1  — Banco di Sardegna (mensile servizi)
 *   banco_sardegna_quarterly_statement_v1 — Banco di Sardegna (trimestrale)
 *   generic_statement_v1                — non riconosciuto
 */
export function detectBankStatementProfile(text, context = {}) {
  const normalized = normalizeMockText(text)
  const fileName = normalizeMockText(context.sourceFileName || '')

  // Compact (whitespace-free) version for IBAN / account number matching because
  // pdfjs often renders "IT 96 C 01015 03200 000070745491" with spaces.
  const compact = normalized.replace(/\s+/g, '')

  // ── SELLA SIGNALS ────────────────────────────────────────────────────────────
  const sellaHits = []

  if (/banca sella/.test(normalized))           sellaHits.push({ label: 'header_banca_sella',       w: 10 })
  if (/selbit/.test(normalized))                sellaHits.push({ label: 'bic_selbit',                w: 10 })
  if (/it39i03268/.test(compact))              sellaHits.push({ label: 'iban_sella_abi03268',       w: 10 })
  if (/estratto conto in sintesi/.test(normalized)) sellaHits.push({ label: 'estratto_conto_in_sintesi', w: 8 })
  if (/riepilogo movimenti/.test(normalized))   sellaHits.push({ label: 'riepilogo_movimenti',      w: 5 })
  if (/data contabile/.test(normalized))        sellaHits.push({ label: 'col_data_contabile',       w: 5 })
  if (/sella/.test(fileName))                   sellaHits.push({ label: 'filename_sella',           w: 5 })

  // ── BANCO DI SARDEGNA SIGNALS ─────────────────────────────────────────────────
  const bancoHits = []

  // Module number present in both monthly and quarterly Banco PDFs
  if (/mod\.\s*05\.13\.0011/.test(normalized))  bancoHits.push({ label: 'mod_05_13_0011',           w: 10 })
  // Exact IBAN for this Banco account (spaces stripped)
  if (/it96c0101503200000070745491/.test(compact)) bancoHits.push({ label: 'iban_banco_exact',      w: 10 })
  // BIC variants: SARDIT3S (mensile) and BPMOIT22 (trimestrale)
  if (/sardit3s/.test(normalized))              bancoHits.push({ label: 'bic_sardit3s',             w: 10 })
  if (/bpmoit22/.test(normalized))              bancoHits.push({ label: 'bic_bpmoit22',             w: 8 })
  // ABI 01015 explicitly labelled (mensile only)
  if (/abi[\s:]+01015/.test(normalized))        bancoHits.push({ label: 'abi_01015',                w: 8 })
  // ── Monthly-specific ──
  if (/riepilogo mensile/.test(normalized))     bancoHits.push({ label: 'riepilogo_mensile',        w: 8 })
  if (/operazioni su servizi di pagamento/.test(normalized)) bancoHits.push({ label: 'operazioni_servizi_pagamento', w: 8 })
  if (/data segno/.test(normalized))            bancoHits.push({ label: 'col_data_segno_da',        w: 8 })
  // ── Quarterly-specific ──
  if (/riepilogo conto corrente/.test(normalized)) bancoHits.push({ label: 'riepilogo_conto_corrente', w: 8 })
  if (/elenco movimenti del periodo/.test(normalized)) bancoHits.push({ label: 'di_seguito_elenco', w: 8 })
  // "uscite  entrate  descrizione" — column header order in trimestrale
  // (Sella uses "descrizione  uscite  entrate" so this order is Banco-exclusive)
  if (/uscite\s+entrate\s+descrizione/.test(normalized)) bancoHits.push({ label: 'col_uscite_entrate_desc', w: 8 })
  // Known account number (both variants share it)
  if (/000070745491/.test(compact))             bancoHits.push({ label: 'conto_banco_known',        w: 5 })
  if (/banco di sardegna|sardegna/.test(fileName)) bancoHits.push({ label: 'filename_banco',        w: 5 })

  // ── SCORING ──────────────────────────────────────────────────────────────────
  const sellaScore = sellaHits.reduce((s, h) => s + h.w, 0)
  const bancoScore = bancoHits.reduce((s, h) => s + h.w, 0)
  const matchedSignals = {
    sella: sellaHits.map(h => h.label),
    banco: bancoHits.map(h => h.label),
  }
  const scores = { sella: sellaScore, banco: bancoScore }

  // Strong exclusive signals — high-weight identifiers unique to each bank
  const STRONG_SELLA = sellaHits.some(h => ['header_banca_sella', 'bic_selbit', 'iban_sella_abi03268'].includes(h.label))
  const STRONG_BANCO = bancoHits.some(h => ['mod_05_13_0011', 'iban_banco_exact', 'bic_sardit3s'].includes(h.label))

  // Helper: pick monthly vs quarterly Banco sub-profile
  const bankoBancoSubprofile = () => {
    const isMonthly = bancoHits.some(h =>
      ['riepilogo_mensile', 'operazioni_servizi_pagamento', 'col_data_segno_da', 'bic_sardit3s'].includes(h.label)
    )
    return isMonthly
      ? 'banco_sardegna_monthly_services_v1'
      : 'banco_sardegna_quarterly_statement_v1'
  }

  // ── DECISION ─────────────────────────────────────────────────────────────────

  // Case 1: only Sella has strong signals → Sella
  if (STRONG_SELLA && !STRONG_BANCO) {
    return { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'high', matchedSignals, scores }
  }

  // Case 2: only Banco has strong signals → Banco (monthly or quarterly)
  if (STRONG_BANCO && !STRONG_SELLA) {
    return { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'high', matchedSignals, scores }
  }

  // Case 3: both have strong signals (ambiguous) → higher score wins
  if (STRONG_SELLA && STRONG_BANCO) {
    if (sellaScore >= bancoScore) {
      return { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'medium', matchedSignals, scores }
    }
    return { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'medium', matchedSignals, scores }
  }

  // Case 4: no strong signals — use weak-signal score with minimum threshold
  if (bancoScore > sellaScore && bancoScore >= 5) {
    return { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'low', matchedSignals, scores }
  }
  if (sellaScore > bancoScore && sellaScore >= 5) {
    return { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'low', matchedSignals, scores }
  }

  // Case 5: truly undecided — generic, do NOT default to Sella
  return { profile: 'generic_statement_v1', profileLabel: 'Generico', confidence: 'none', matchedSignals, scores }
}
