import * as XLSX from 'xlsx'
import { extractTextFromPDFBrowser } from '../../../shared/utils/index.js'
import { buildPrimaNotaHeaderPayload } from '../../../../domain/primaNotaPayloadBuilder.js'
import { createPrimaNotaCompleta } from '../../../../services/primaNotaService.js'
import { applyLearningFromFeedback } from '../../../../services/aiLearningEngine.js'
import { findAnagraficaConto, normPiva } from '../../../../services/autoValidateAccountingEngine.js'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { sb } from '../../../lib/supabase.js'

export const NES_IMPORT_SOURCE = 'NES_IMPORT'
const ROLE_PARENTS = {
  cliente_italia: '1 02 20',
  cliente_estero: '1 02 10',
  fornitore_italia: '2 03 07',
  fornitore_estero: '2 03 09',
  professionista: '2 03 10',
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `nes_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAmount(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function parseDateGuess(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const s = String(value).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/)
  if (dmy) {
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${yy}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`
  }
  return null
}

function batchId() {
  return `NES-${new Date().toISOString().slice(0, 10)}-${uid().slice(0, 8).toUpperCase()}`
}

function safeKey(record = {}) {
  return normalizeText([
    record.kind || '',
    record.data_registrazione || '',
    record.numero_registrazione || '',
    record.numero_documento || '',
    record.causale_codice || '',
    record.causale_iva_codice || '',
    record.conto_codice || '',
    record.conto_descrizione || '',
    record.soggetto_piva || record.soggetto_cf || record.soggetto_denominazione || '',
    record.totale ?? record.dare ?? record.avere ?? '',
  ].join('|')).slice(0, 180)
}

function detectKind(rowObj = {}, sheetName = '', headers = []) {
  const blob = `${sheetName} ${headers.join(' ')} ${Object.values(rowObj).join(' ')}`
  const hasPrimo = Boolean(rowObj.numero_registrazione || rowObj.dare != null || rowObj.avere != null)
  const hasFatt = Boolean(rowObj.imponibile || rowObj.totale || rowObj.numero_documento)
  const hasMaster = Boolean(rowObj.soggetto_denominazione || rowObj.soggetto_piva || rowObj.soggetto_cf)
  if (/anagrafic|client|fornitor|percipient/i.test(blob) || (hasMaster && !hasPrimo && !hasFatt)) return 'master_data'
  if (/prima nota|partit|moviment|giornale|scheda/i.test(blob) || hasPrimo) return 'prima_nota'
  if (/fattur|document/i.test(blob) || hasFatt) return 'invoice'
  return 'unknown'
}

function headerMap(row = []) {
  const map = {}
  row.forEach((cell, idx) => {
    const key = normalizeText(cell)
    if (key && map[key] == null) map[key] = idx
  })
  return map
}

function pick(row, map, names = []) {
  for (const n of names) {
    const idx = map[normalizeText(n)]
    if (idx != null && row[idx] != null && String(row[idx]).trim() !== '') return row[idx]
  }
  return null
}

function rowToRecord(raw, ctx = {}) {
  const kind = detectKind(raw, ctx.sheetName, ctx.headers || [])
  const blob = `${ctx.sheetName || ''} ${(ctx.headers || []).join(' ')} ${Object.values(raw || {}).join(' ')}`
  const invoiceDirection =
    /attiv|vendit/i.test(blob) ? 'attiva' : /passiv|acquist|fornitor/i.test(blob) ? 'passiva' : null
  const record = {
    kind,
    sheetName: ctx.sheetName || '',
    source_row: ctx.rowIndex ?? null,
    invoice_direction: kind === 'invoice' ? invoiceDirection : null,
    data_registrazione: parseDateGuess(raw.data_registrazione || raw.data_documento || raw.data || raw.competenza),
    numero_documento: String(raw.numero_documento || raw.numero || raw.documento || '').trim() || null,
    numero_registrazione: String(raw.numero_registrazione || raw.progressivo || '').trim() || null,
    soggetto_denominazione: String(raw.soggetto_denominazione || raw.denominazione || raw.ragione_sociale || raw.nome || '').trim() || null,
    soggetto_piva: normPiva(raw.soggetto_piva || raw.partita_iva || raw.piva || ''),
    soggetto_cf: normPiva(raw.soggetto_cf || raw.codice_fiscale || raw.cf || ''),
    conto_codice: String(raw.conto_codice || raw.codice_conto || raw.conto || '').trim() || null,
    conto_descrizione: String(raw.conto_descrizione || raw.descrizione_conto || raw.descrizione || '').trim() || null,
    causale_codice: String(raw.causale_codice || raw.causale || '').trim() || null,
    causale_iva_codice: String(raw.causale_iva_codice || raw.iva_codice || '').trim() || null,
    descrizione: String(raw.descrizione_riga || raw.descrizione || raw.note || '').trim() || null,
    dare: parseAmount(raw.dare || raw.importo_dare),
    avere: parseAmount(raw.avere || raw.importo_avere),
    imponibile: parseAmount(raw.imponibile),
    iva: parseAmount(raw.iva || raw.imposta),
    totale: parseAmount(raw.totale || raw.importo),
    role: String(raw.tipo_soggetto || raw.anagrafica_tipo || raw.role || '').trim().toLowerCase() || null,
    raw,
  }
  record.safe_key = safeKey(record)
  return kind === 'unknown' ? null : record
}

function previewSummary(records = [], duplicates = []) {
  const subjects = new Set()
  const accounts = new Set()
  let useful = 0
  let missing = 0
  for (const r of records) {
    if (r.soggetto_piva || r.soggetto_cf || r.soggetto_denominazione) subjects.add(r.soggetto_piva || r.soggetto_cf || r.soggetto_denominazione)
    if (r.conto_codice || r.conto_descrizione) accounts.add(r.conto_codice || r.conto_descrizione)
    if (r.kind !== 'master_data' && (!r.data_registrazione || (!r.numero_documento && !r.numero_registrazione))) missing += 1
    if ((r.soggetto_piva || r.soggetto_cf || r.soggetto_denominazione) && (r.conto_codice || r.conto_descrizione)) useful += 1
  }
  return {
    total: records.length,
    prima_nota: records.filter((r) => r.kind === 'prima_nota').length,
    invoice: records.filter((r) => r.kind === 'invoice').length,
    master_data: records.filter((r) => r.kind === 'master_data').length,
    subjects: subjects.size,
    accounts: accounts.size,
    duplicates: duplicates.length,
    missingKeyFields: missing,
    usefulness: records.length ? Math.round((useful / records.length) * 100) : 0,
  }
}

function parseSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', raw: false, cellDates: true })
  const out = []
  for (const sheetName of wb.SheetNames || []) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
    if (!rows.length) continue
    const headerRowIndex = rows.findIndex((r) => Array.isArray(r) && r.filter(Boolean).length >= 2)
    const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : rows[0]
    const map = headerMap(headerRow)
    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i]
      if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue
      const raw = {
        data_registrazione: pick(row, map, ['data registrazione', 'data reg', 'data']),
        data_documento: pick(row, map, ['data documento', 'data doc']),
        numero_documento: pick(row, map, ['numero documento', 'documento', 'numero']),
        numero_registrazione: pick(row, map, ['numero registrazione', 'progressivo', 'progr']),
        causale_codice: pick(row, map, ['causale contabile', 'causale']),
        causale_iva_codice: pick(row, map, ['causale iva', 'iva cod', 'registro iva']),
        conto_codice: pick(row, map, ['conto', 'codice conto']),
        conto_descrizione: pick(row, map, ['descrizione conto', 'descrizione']),
        soggetto_denominazione: pick(row, map, ['ragione sociale', 'denominazione', 'soggetto', 'cliente', 'fornitore', 'nome']),
        soggetto_piva: pick(row, map, ['partita iva', 'piva', 'p.iva']),
        soggetto_cf: pick(row, map, ['codice fiscale', 'cf']),
        descrizione_riga: pick(row, map, ['descrizione riga', 'descrizione', 'note']),
        dare: pick(row, map, ['dare']),
        avere: pick(row, map, ['avere']),
        imponibile: pick(row, map, ['imponibile']),
        iva: pick(row, map, ['iva', 'imposta']),
        totale: pick(row, map, ['totale', 'importo']),
        tipo_soggetto: pick(row, map, ['tipo soggetto', 'anagrafica tipo', 'categoria']),
      }
      const rec = rowToRecord(raw, { sheetName, headers: headerRow, rowIndex: i + 1 })
      if (rec) out.push(rec)
    }
  }
  return out
}

function parsePdfLines(text) {
  const out = []
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  for (const [idx, line] of lines.entries()) {
    const date = parseDateGuess((line.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/) || [])[1])
    const amounts = [...line.matchAll(/\b\d{1,3}(?:\.\d{3})*(?:,\d{2})\b/g)].map((m) => parseAmount(m[0])).filter((n) => n != null)
    if (!date && amounts.length === 0) continue
    const rec = rowToRecord({
      data_registrazione: date,
      numero_documento: (line.match(/^\s*(\d{1,7})\b/) || [])[1] || null,
      descrizione_riga: line.slice(0, 180),
      dare: amounts[0] ?? null,
      avere: amounts[1] ?? null,
      totale: amounts.at(-1) ?? null,
    }, { sheetName: 'PDF', rowIndex: idx + 1, headers: [] })
    if (rec) out.push(rec)
  }
  return out
}

async function parsePdfWithAi(text, fileName) {
  try {
    const prompt = [
      'Estrai un JSON valido dall\'export storico NES.',
      'Rispondi SOLO con JSON nel formato { "records": [ ... ] }.',
      'Ogni record deve avere kind (prima_nota|invoice|master_data) e i campi principali.',
      `Nome file: ${fileName}`,
      text.slice(0, 12000),
    ].join('\n')
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ollama_analyze', prompt, model: 'mistral' }),
    })
    if (!resp.ok) return []
    const data = await resp.json().catch(() => ({}))
    const raw = String(data?.response || '')
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw)
    return Array.isArray(json?.records) ? json.records.map((r) => rowToRecord(r, { sheetName: 'PDF_AI', headers: [] })).filter(Boolean) : []
  } catch {
    return []
  }
}

function roleParent(role) {
  return ROLE_PARENTS[role] || null
}

function subjectRole(record) {
  if (record.role) return record.role
  if (record.kind === 'invoice') return 'fornitore_italia'
  return null
}

function findAccountByCode(pianoConti, code) {
  const c = String(code || '').trim()
  return (pianoConti || []).find((x) => String(x.codice || '').trim() === c) || null
}

function normalizeNameKey(value) {
  return normalizeText(String(value || '').replace(/\b(s\.?r\.?l\.?|spa|srl|snc|sas|srls)\b/gi, ' '))
}

function subjectIdentity(record = {}) {
  const piva = record.soggetto_piva || ''
  const cf = record.soggetto_cf || ''
  const nome = record.soggetto_denominazione || ''
  const subjectKey = piva || cf || normalizeNameKey(nome) || 'soggetto'
  return { piva, cf, nome, subjectKey }
}

function groupRecordKey(record = {}) {
  const { subjectKey } = subjectIdentity(record)
  const date = record.data_registrazione || ''
  const docDate = record.data_registrazione || ''
  if (record.kind === 'master_data') {
    return `master:${subjectKey}`
  }
  if (record.kind === 'invoice') {
    return `inv:${docDate}:${record.numero_documento || ''}:${subjectKey}:${record.totale ?? ''}`
  }
  return `pn:${date}:${record.numero_registrazione || ''}:${record.causale_codice || ''}:${subjectKey}`
}

function groupHistoricalRecords(records = []) {
  const groups = new Map()
  for (const record of records || []) {
    const key = groupRecordKey(record)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind: record.kind,
        invoice_direction: record.invoice_direction || null,
        records: [],
      })
    }
    const g = groups.get(key)
    g.records.push(record)
    if (record.kind === 'invoice') g.kind = 'invoice'
    if (record.kind === 'prima_nota' && g.kind !== 'invoice') g.kind = 'prima_nota'
    if (record.invoice_direction && !g.invoice_direction) g.invoice_direction = record.invoice_direction
  }
  return [...groups.values()].map((group) => {
    const first = group.records[0] || {}
    const totalDare = group.records.reduce((acc, r) => acc + (Number(r.dare) || 0), 0)
    const totalAvere = group.records.reduce((acc, r) => acc + (Number(r.avere) || 0), 0)
    const imponibile = group.records.reduce((acc, r) => acc + (Number(r.imponibile) || 0), 0)
    const iva = group.records.reduce((acc, r) => acc + (Number(r.iva) || 0), 0)
    const totale = group.records.reduce((acc, r) => acc + (Number(r.totale) || 0), 0)
    const subject = subjectIdentity(first)
    return {
      ...group,
      first,
      subject,
      safe_key: groupRecordKey(first),
      data_registrazione: first.data_registrazione || null,
      numero_documento: first.numero_documento || null,
      numero_registrazione: first.numero_registrazione || null,
      causale_codice: first.causale_codice || null,
      causale_iva_codice: first.causale_iva_codice || null,
      conto_codice: first.conto_codice || null,
      conto_descrizione: first.conto_descrizione || null,
      descrizione: first.descrizione || null,
      dare: totalDare || null,
      avere: totalAvere || null,
      imponibile: imponibile || null,
      iva: iva || null,
      totale: totale || null,
    }
  })
}

function buildImportMetadata({ sourceKey, batchIdValue, kind, safeKey, fileName }) {
  return {
    source: NES_IMPORT_SOURCE,
    migrated: true,
    imported_at: new Date().toISOString(),
    imported_batch_id: batchIdValue,
    source_key: sourceKey,
    safe_key: safeKey,
    kind,
    file_name: fileName,
  }
}

function buildSourceKey(kind, safeKey) {
  return `${NES_IMPORT_SOURCE}::${kind}::${safeKey}`
}

function buildHistoricalDuplicateKeys(groups = []) {
  return groups.map((g) => buildSourceKey(g.kind, g.safe_key))
}

function bestString(v) {
  return String(v ?? '').trim()
}

function toCurrency(v) {
  const n = parseAmount(v)
  return Number.isFinite(n) ? n : 0
}

function guessRoleFromGroup(group) {
  if (group?.first?.role) return group.first.role
  if (group?.kind === 'invoice') return group.invoice_direction === 'attiva' ? 'cliente_italia' : 'fornitore_italia'
  return 'fornitore_italia'
}

function buildHistoricalNote(group) {
  const pieces = [
    `NES_IMPORT ${group.safe_key}`,
    group.subject?.nome ? `soggetto:${group.subject.nome}` : null,
    group.causale_codice ? `causale:${group.causale_codice}` : null,
  ].filter(Boolean)
  return pieces.join(' | ').slice(0, 500)
}

function selectPrimaryAccountForGroup(pianoConti, group) {
  const exactCode = findAccountByCode(pianoConti, group.conto_codice)
  if (exactCode) return exactCode

  const desc = normalizeNameKey(group.conto_descrizione || group.descrizione || '')
  if (!desc) return null

  return (
    (pianoConti || []).find((c) => normalizeNameKey(c.descrizione || '') === desc) ||
    (pianoConti || []).find((c) => normalizeNameKey(c.descrizione || '').includes(desc) || desc.includes(normalizeNameKey(c.descrizione || ''))) ||
    null
  )
}

function selectIvaAccount(pianoConti, isPassiva) {
  const patterns = isPassiva
    ? [/iva.*credito/i, /iva ns credito/i, /iva acquisti/i]
    : [/iva.*debito/i, /iva ns debito/i, /iva vendite/i]
  return (
    (pianoConti || []).find((c) => patterns.some((re) => re.test(String(c.descrizione || '')))) ||
    null
  )
}

function buildRowsForGroup(group, pianoConti, contoPrincipale, contoControparte, contoIva) {
  const isAttiva = group.kind === 'invoice' && group.invoice_direction === 'attiva'
  const isPassiva = group.kind === 'invoice' ? !isAttiva : true
  const importoBase = toCurrency(group.imponibile || group.totale || group.dare || group.avere)
  const iva = toCurrency(group.iva)
  const totale = toCurrency(group.totale || group.dare || group.avere || importoBase + iva)
  const rows = []

  if (group.kind === 'prima_nota') {
    for (const [idx, r] of group.records.entries()) {
      const conto = r.conto_codice ? findAccountByCode(pianoConti, r.conto_codice) : null
      rows.push({
        riga_numero: idx + 1,
        conto_id: conto?.id || null,
        conto_codice: r.conto_codice || conto?.codice || null,
        conto_descrizione: r.conto_descrizione || conto?.descrizione || null,
        descrizione_riga: r.descrizione || r.conto_descrizione || 'Riga storico NES',
        importo_dare: toCurrency(r.dare),
        importo_avere: toCurrency(r.avere),
        imponibile: toCurrency(r.imponibile),
        iva: toCurrency(r.iva),
      })
    }
    return { rows, totale }
  }

  if (isPassiva) {
    if (contoPrincipale) {
      rows.push({
        riga_numero: 1,
        conto_id: contoPrincipale.id,
        conto_codice: contoPrincipale.codice,
        conto_descrizione: contoPrincipale.descrizione,
        descrizione_riga: group.conto_descrizione || 'Costo/Acquisto',
        importo_dare: importoBase,
        importo_avere: 0,
        imponibile: importoBase,
        iva: 0,
      })
    }
    if (iva > 0 && contoIva) {
      rows.push({
        riga_numero: rows.length + 1,
        conto_id: contoIva.id,
        conto_codice: contoIva.codice,
        conto_descrizione: contoIva.descrizione,
        descrizione_riga: 'IVA a credito',
        importo_dare: iva,
        importo_avere: 0,
        imponibile: 0,
        iva,
      })
    }
    if (contoControparte) {
      rows.push({
        riga_numero: rows.length + 1,
        conto_id: contoControparte.id,
        conto_codice: contoControparte.codice,
        conto_descrizione: contoControparte.descrizione,
        descrizione_riga: `Fornitore ${group.subject?.nome || ''}`.trim(),
        importo_dare: 0,
        importo_avere: totale,
        imponibile: 0,
        iva: 0,
      })
    }
  } else {
    if (contoControparte) {
      rows.push({
        riga_numero: 1,
        conto_id: contoControparte.id,
        conto_codice: contoControparte.codice,
        conto_descrizione: contoControparte.descrizione,
        descrizione_riga: `Cliente ${group.subject?.nome || ''}`.trim(),
        importo_dare: totale,
        importo_avere: 0,
        imponibile: 0,
        iva: 0,
      })
    }
    if (contoPrincipale) {
      rows.push({
        riga_numero: rows.length + 1,
        conto_id: contoPrincipale.id,
        conto_codice: contoPrincipale.codice,
        conto_descrizione: contoPrincipale.descrizione,
        descrizione_riga: group.conto_descrizione || 'Ricavo/Vendita',
        importo_dare: 0,
        importo_avere: importoBase,
        imponibile: importoBase,
        iva: 0,
      })
    }
    if (iva > 0 && contoIva) {
      rows.push({
        riga_numero: rows.length + 1,
        conto_id: contoIva.id,
        conto_codice: contoIva.codice,
        conto_descrizione: contoIva.descrizione,
        descrizione_riga: 'IVA a debito',
        importo_dare: 0,
        importo_avere: iva,
        imponibile: 0,
        iva,
      })
    }
  }

  return { rows, totale }
}

async function fetchExistingSourceKeys(societaId, groups = []) {
  const keys = buildHistoricalDuplicateKeys(groups)
  if (!keys.length) return new Set()
  const keySet = new Set()

  const docKeys = keys.slice(0, 500)
  const { data: docs } = await sb
    .from('documenti_contabilita')
    .select('id, source_document_id, dati_estratti, numero_documento, data_documento, soggetto_piva, soggetto_cf, soggetto_denominazione, totale')
    .eq('societa_id', societaId)
    .in('source_document_id', docKeys)
  for (const row of docs || []) {
    const sourceKey = bestString(row.source_document_id)
    if (sourceKey) keySet.add(sourceKey)
  }

  const { data: pn } = await sb
    .from('prima_nota')
    .select('id, documento_import_id, descrizione, numero_documento, data_registrazione, causale_codice')
    .eq('societa_id', societaId)
    .in('documento_import_id', docKeys)
  for (const row of pn || []) {
    const sourceKey = bestString(row?.documento_import_id)
    if (sourceKey) keySet.add(sourceKey)
  }

  return keySet
}

async function ensureCounterpartyAccount({
  societaId,
  pianoConti,
  group,
}) {
  const subject = group.subject || {}
  const pivaNorm = normPiva(subject.piva || '')
  const cfNorm = normPiva(subject.cf || '')
  const nameNorm = normalizeNameKey(subject.nome || '')
  const strongMatch = findAnagraficaConto(pianoConti, pivaNorm || cfNorm)
  if (strongMatch) {
    return { account: strongMatch, action: 'linked_strong', created: false, warning: null }
  }

  const byName = (pianoConti || []).find((c) => {
    const desc = normalizeNameKey(c.descrizione || c.ragione_sociale || '')
    return desc && nameNorm && (desc === nameNorm || desc.includes(nameNorm) || nameNorm.includes(desc))
  })
  if (byName) {
    return {
      account: byName,
      action: 'linked_name',
      created: false,
      warning: pivaNorm || cfNorm ? 'Nome collegato ma PIVA/CF non coincidenti' : null,
    }
  }

  const role = guessRoleFromGroup(group)
  const parent = roleParent(role) || roleParent('fornitore_italia')
  const level = parent.split(' ').length + 1
  const { data: existingCodes } = await contabilitaRepo
    .getPianoContiCodiciByLike(societaId, parent)
    .eq('livello', level)
    .order('codice', { ascending: false })
    .limit(1)
  let codice
  if (!existingCodes?.length) {
    codice = level === 4 ? `${parent} 0001` : `${parent} 01`
  } else {
    const lastParts = String(existingCodes[0].codice || '').trim().split(' ')
    const lastNum = parseInt(lastParts[lastParts.length - 1], 10) || 0
    codice = `${parent} ${String(lastNum + 1).padStart(level === 4 ? 4 : 2, '0')}`
  }
  const parts = codice.trim().split(' ')
  const levelNum = parts.length
  const isCliente = role.startsWith('cliente')
  const isFornitore = role.startsWith('fornitore') || role === 'professionista'
  const isProfessionista = role === 'professionista'
  const tipo = role.startsWith('cliente') || role.startsWith('fornitore') || isProfessionista ? 'patrimoniale' : 'patrimoniale'
  const natura = isCliente ? 'attivo' : 'passivo'
  const sezione = isCliente ? 'dare' : 'avere'
  const payload = {
    societa_id: societaId,
    codice: codice.trim(),
    codice_mastro: parts[0] || null,
    codice_conto: levelNum >= 3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
    codice_sottoconto: levelNum >= 4 ? codice.trim() : null,
    descrizione: subject.nome || group.conto_descrizione || 'Soggetto NES import',
    tipo,
    natura,
    sezione,
    livello: levelNum,
    is_cliente: !!isCliente,
    is_fornitore: !!isFornitore,
    is_professionista: !!isProfessionista,
    anagrafica_tipo: role,
    partita_iva: pivaNorm || null,
    codice_fiscale: cfNorm || null,
    anagrafica_piva: pivaNorm || null,
    anagrafica_cf: cfNorm || null,
    note: buildHistoricalNote(group),
    attivo: true,
  }
  const ins = await contabilitaRepo.insertPianoConto(payload)
  if (ins?.error) {
    return { account: null, created: false, action: 'create_failed', error: ins.error.message || String(ins.error) }
  }
  const account = Array.isArray(ins?.data) ? ins.data[0] : ins?.data || payload
  return { account, created: true, action: 'created', warning: null }
}

async function ensureSupportingAccount({
  societaId,
  pianoConti,
  role,
  label,
  note,
}) {
  const parent = roleParent(role) || roleParent('fornitore_italia')
  const level = parent.split(' ').length + 1
  const existing = (pianoConti || []).find((c) => normalizeNameKey(c.descrizione || '') === normalizeNameKey(label || ''))
  if (existing) return { account: existing, created: false }
  const { data: existingCodes } = await contabilitaRepo
    .getPianoContiCodiciByLike(societaId, parent)
    .eq('livello', level)
    .order('codice', { ascending: false })
    .limit(1)
  let codice
  if (!existingCodes?.length) codice = level === 4 ? `${parent} 0001` : `${parent} 01`
  else {
    const lastParts = String(existingCodes[0].codice || '').trim().split(' ')
    const lastNum = parseInt(lastParts[lastParts.length - 1], 10) || 0
    codice = `${parent} ${String(lastNum + 1).padStart(level === 4 ? 4 : 2, '0')}`
  }
  const parts = codice.trim().split(' ')
  const isCliente = role.startsWith('cliente')
  const isFornitore = role.startsWith('fornitore') || role === 'professionista'
  const payload = {
    societa_id: societaId,
    codice: codice.trim(),
    codice_mastro: parts[0] || null,
    codice_conto: level >= 3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
    codice_sottoconto: level >= 4 ? codice.trim() : null,
    descrizione: label,
    tipo: 'patrimoniale',
    natura: isCliente ? 'attivo' : 'passivo',
    sezione: isCliente ? 'dare' : 'avere',
    livello: level,
    is_cliente: !!isCliente,
    is_fornitore: !!isFornitore,
    is_professionista: role === 'professionista',
    anagrafica_tipo: role,
    note: note || null,
    attivo: true,
  }
  const ins = await contabilitaRepo.insertPianoConto(payload)
  if (ins?.error) return { account: null, created: false, error: ins.error.message || String(ins.error) }
  return { account: Array.isArray(ins?.data) ? ins.data[0] : ins?.data || payload, created: true }
}

function summarizeGroups(groups = [], duplicates = []) {
  const subjects = new Set()
  const accounts = new Set()
  let missing = 0
  let usefulness = 0
  for (const g of groups || []) {
    if (g.subject?.piva || g.subject?.cf || g.subject?.nome) subjects.add(g.subject?.piva || g.subject?.cf || g.subject?.nome)
    if (g.conto_codice || g.conto_descrizione) accounts.add(g.conto_codice || g.conto_descrizione)
    if ((g.kind !== 'master_data') && (!g.data_registrazione || (!g.numero_documento && !g.numero_registrazione))) missing += 1
    if ((g.subject?.piva || g.subject?.cf || g.subject?.nome) && (g.conto_codice || g.conto_descrizione)) usefulness += 1
  }
  return {
    total: groups.length,
    prima_nota: groups.filter((g) => g.kind === 'prima_nota').length,
    invoice: groups.filter((g) => g.kind === 'invoice').length,
    master_data: groups.filter((g) => g.kind === 'master_data').length,
    subjects: subjects.size,
    accounts: accounts.size,
    duplicates: duplicates.length,
    missingKeyFields: missing,
    usefulness: groups.length ? Math.round((usefulness / groups.length) * 100) : 0,
  }
}

export async function parseNesHistoricalImportFile(file, { allowAiFallback = true } = {}) {
  const batch = batchId()
  const fileName = file?.name || 'NES_IMPORT'
  if (!file) return { batchId: batch, fileName, records: [], preview: previewSummary([]) }

  if (String(fileName).toLowerCase().endsWith('.pdf')) {
    const text = await extractTextFromPDFBrowser(file)
    let records = parsePdfLines(text)
    if (allowAiFallback && records.length < 3) {
      const aiRecords = await parsePdfWithAi(text, fileName)
      if (aiRecords.length > records.length) records = aiRecords
    }
    return { batchId: batch, fileName, source: 'pdf', records, preview: previewSummary(records), rawTextLength: text.length }
  }

  const records = parseSpreadsheet(await file.arrayBuffer())
  return { batchId: batch, fileName, source: 'spreadsheet', records, preview: previewSummary(records) }
}

export function buildNesHistoricalPreview(records = [], duplicates = []) {
  const groups = groupHistoricalRecords(records)
  return summarizeGroups(groups, duplicates)
}

export function buildNesHistoricalGroups(records = []) {
  return groupHistoricalRecords(records)
}

export async function inspectNesHistoricalImport({
  societaId,
  records = [],
  includeKinds = { prima_nota: true, invoice: true, master_data: true },
} = {}) {
  const groups = groupHistoricalRecords(records).filter((group) => includeKinds?.[group.kind] !== false)
  const duplicateKeys = await fetchExistingSourceKeys(societaId, groups)
  const duplicates = groups.filter((group) => duplicateKeys.has(buildSourceKey(group.kind, group.safe_key)))
  return {
    groups,
    duplicates,
    preview: summarizeGroups(groups, duplicates),
  }
}

export async function runNesHistoricalImport({
  societaId,
  pianoConti = [],
  causaliContabili = [],
  causaliIva = [],
  records = [],
  dateFrom = null,
  dateTo = null,
  fileName = 'NES_IMPORT',
  batchIdValue = batchId(),
  includeKinds = { prima_nota: true, invoice: true, master_data: true },
} = {}) {
  const groups = groupHistoricalRecords(records).filter((group) => includeKinds?.[group.kind] !== false)
  const duplicates = []
  const duplicateKeys = await fetchExistingSourceKeys(societaId, groups)
  const report = {
    batchId: batchIdValue,
    fileName,
    dateFrom,
    dateTo,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    subjectsCreated: 0,
    subjectsLinked: 0,
    accountsLearned: 0,
    accountingEntriesCreated: 0,
    primaNoteCreated: 0,
    documentiCreated: 0,
    masterDataCreated: 0,
    warnings: [],
    anomalies: [],
    duplicateSamples: [],
    importedSamples: [],
  }

  for (const group of groups) {
    const sourceKey = buildSourceKey(group.kind, group.safe_key)
    if (duplicateKeys.has(sourceKey)) {
      duplicates.push({ key: group.key, sourceKey, kind: group.kind, safe_key: group.safe_key })
      report.duplicates += 1
      report.skipped += 1
      report.duplicateSamples.push({
        kind: group.kind,
        source_key: sourceKey,
        subject: group.subject?.nome || '',
        numero_documento: group.numero_documento || '',
        numero_registrazione: group.numero_registrazione || '',
      })
      continue
    }

    try {
      if (group.kind === 'master_data') {
        const linked = await ensureCounterpartyAccount({ societaId, pianoConti, group })
        if (linked?.created) {
          pianoConti.push(linked.account)
          report.subjectsCreated += 1
          report.masterDataCreated += 1
        } else if (linked?.account) {
          report.subjectsLinked += 1
        }
        if (linked?.warning) report.warnings.push(linked.warning)
        report.imported += 1
        report.importedSamples.push({
          kind: group.kind,
          subject: group.subject?.nome || '',
          action: linked?.created ? 'created' : 'linked',
        })
        continue
      }

      const counterparty = await ensureCounterpartyAccount({ societaId, pianoConti, group })
      if (counterparty?.created) {
        pianoConti.push(counterparty.account)
        report.subjectsCreated += 1
      } else if (counterparty?.account) {
        report.subjectsLinked += 1
      }
      if (counterparty?.warning) report.warnings.push(counterparty.warning)

      const primaryAccount = selectPrimaryAccountForGroup(pianoConti, group)
      const ivaAccount = selectIvaAccount(pianoConti, group.kind === 'invoice' ? group.invoice_direction !== 'attiva' : true)
      if (!primaryAccount) {
        report.anomalies.push({
          kind: group.kind,
          subject: group.subject?.nome || '',
          note: 'Conto principale non trovato: importo/causale lasciati in sola memoria',
          source_key: sourceKey,
        })
      }

      const { rows, totale } = buildRowsForGroup(group, pianoConti, primaryAccount, counterparty?.account || null, ivaAccount)
      const importMeta = buildImportMetadata({
        sourceKey,
        batchIdValue,
        kind: group.kind,
        safeKey: group.safe_key,
        fileName,
      })
      const docPayload = {
        societa_id: societaId,
        filename: `${fileName}#${group.safe_key}`,
        file_path: `${NES_IMPORT_SOURCE}/${batchIdValue}/${group.safe_key}`,
        file_url: null,
        mime_type: 'application/x-nes-historical',
        file_size: null,
        tipo_documento:
          group.kind === 'invoice'
            ? group.invoice_direction === 'attiva'
              ? 'fattura_attiva'
              : 'fattura_passiva'
            : 'historical_prima_nota',
        numero_documento: group.numero_documento || null,
        data_documento: group.data_registrazione || dateFrom || null,
        soggetto_denominazione: group.subject?.nome || null,
        soggetto_piva: group.subject?.piva || null,
        soggetto_cf: group.subject?.cf || null,
        imponibile: group.imponibile || null,
        iva: group.iva || null,
        totale: group.totale || totale || null,
        workflow_status: 'registered',
        validation_status: 'confirmed',
        ai_confidence: 100,
        registered_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        source_document_id: sourceKey,
        dati_estratti: {
          import_metadata: importMeta,
          nes_historical: true,
          records: group.records,
        },
      }
      const docIns = await contabilitaRepo.insertDocumentoContabilita(docPayload)
      if (docIns?.error) throw docIns.error
      const docRow = docIns?.data?.[0] || docIns?.data || null
      if (docRow?.id) report.documentiCreated += 1

      const canCreateAccounting =
        group.kind === 'prima_nota'
          ? rows.length > 0
          : Boolean(primaryAccount && counterparty?.account)
      if (!canCreateAccounting) {
        report.warnings.push(
          `Nessuna scrittura contabile generata per ${group.kind} ${group.subject?.nome || group.safe_key}: conto principale o righe insufficienti.`
        )
        report.imported += 1
        report.importedSamples.push({
          kind: group.kind,
          subject: group.subject?.nome || '',
          source_key: sourceKey,
          primary_account: primaryAccount?.codice || null,
          note: 'solo documento importato',
        })
        continue
      }

      const pnPayload = buildPrimaNotaHeaderPayload({
        societa_id: societaId,
        data_registrazione: group.data_registrazione || dateFrom || new Date().toISOString().slice(0, 10),
        data_documento: group.data_registrazione || dateFrom || null,
        numero_documento: group.numero_documento || null,
        causale_id: null,
        causale_codice: group.causale_codice || (group.kind === 'invoice' ? (group.invoice_direction === 'attiva' ? 'FC' : 'FF') : 'PN'),
        descrizione: `[NES_IMPORT ${batchIdValue}] ${group.kind === 'invoice' ? 'Fattura storica' : 'Prima nota storica'} ${group.subject?.nome || ''}`.trim(),
        cliente_fornitore_id: counterparty?.account?.id || null,
        cliente_fornitore_nome: group.subject?.nome || null,
        totale_dare: group.kind === 'invoice' ? (group.invoice_direction === 'attiva' ? group.totale || 0 : group.totale || 0) : group.dare || group.avere || 0,
        totale_avere: group.kind === 'invoice' ? (group.invoice_direction === 'attiva' ? group.totale || 0 : group.totale || 0) : group.dare || group.avere || 0,
        stato: 'definitiva',
        documento_import_id: sourceKey,
      })

      const righePayload = rows.map((r, idx) => ({
        riga_numero: r.riga_numero || idx + 1,
        conto_id: r.conto_id || null,
        conto_codice: r.conto_codice || null,
        conto_descrizione: r.conto_descrizione || null,
        descrizione_riga: r.descrizione_riga || null,
        dare: toCurrency(r.importo_dare),
        avere: toCurrency(r.importo_avere),
        imponibile: toCurrency(r.imponibile),
        iva: toCurrency(r.iva),
      }))

      const pnRes = await createPrimaNotaCompleta({
        pnPayload,
        righePayload,
        partEntries: [],
        headerSelect: '*',
        righeSelect: '*',
        partitarioSelect: '*',
      })
      if (pnRes?.error) {
        report.warnings.push(pnRes.error?.message || String(pnRes.error))
      } else {
        report.primaNoteCreated += 1
      }

      const accountingEntryPayload = {
        document_id: docRow?.id || null,
        status: 'CREATED',
        data: {
          source: NES_IMPORT_SOURCE,
          batch_id: batchIdValue,
          source_key: sourceKey,
          kind: group.kind,
          rows: righePayload,
          data: group.data_registrazione || dateFrom || null,
          totale: group.totale || totale || null,
          soggetto_id: counterparty?.account?.id || null,
          skip_partitario: true,
        },
      }
      const accIns = await contabilitaRepo.insertAccountingEntry(accountingEntryPayload)
      if (accIns?.error) {
        report.warnings.push(accIns.error.message || String(accIns.error))
      } else {
        report.accountingEntriesCreated += 1
      }

      const learningAccount = primaryAccount || selectPrimaryAccountForGroup(pianoConti, group)
      if (counterparty?.account?.id && learningAccount?.id && group.kind !== 'master_data') {
        const learnRes = await applyLearningFromFeedback(sb, {
          societaId,
          anagraficaId: counterparty.account.id,
          contoId: learningAccount.id,
          tipo: 'conferma',
        }).catch(() => ({ ok: false }))
        if (learnRes?.ok) report.accountsLearned += 1
      }

      report.imported += 1
      report.importedSamples.push({
        kind: group.kind,
        subject: group.subject?.nome || '',
        source_key: sourceKey,
        primary_account: primaryAccount?.codice || null,
      })
    } catch (error) {
      report.skipped += 1
      report.warnings.push(error?.message || String(error))
    }
  }

  report.preview = summarizeGroups(groups, duplicates)
  report.duplicatesDetected = duplicates.length
  report.duplicateSamples = duplicates.map((d) => ({
    kind: d.kind,
    source_key: d.sourceKey,
    safe_key: d.safe_key,
  }))
  return {
    batchId: batchIdValue,
    fileName,
    groups,
    duplicates,
    report,
  }
}
