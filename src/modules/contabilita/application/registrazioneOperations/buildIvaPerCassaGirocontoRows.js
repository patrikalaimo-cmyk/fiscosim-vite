import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { buildCausaleIvaPolicy } from '../../domain/causali/buildCausaleIvaPolicy.js'

function amount(value) {
  const parsed = Number(String(value ?? 0).replace(',', '.'))
  return Number.isFinite(parsed) ? round2(Math.abs(parsed)) : 0
}

function accountKey(account = {}) {
  if (!account || typeof account !== 'object') return ''
  return normalizeText(account.id || account.conto_id || account.codice || account.conto_codice)
}

function findAccount(pianoConti = [], reference = {}) {
  const source = reference && typeof reference === 'object' ? reference : { id: reference, codice: reference }
  const id = normalizeText(source.id || source.conto_id || source.contoId)
  const code = normalizeText(source.codice || source.code || source.sigla || source.conto_codice)
  const description = normalizeText(
    source.descrizione || source.description || source.nome || source.conto_descrizione
  )
  const catalog = Array.isArray(pianoConti) ? pianoConti : []
  const match = catalog.find((item) => {
    const itemId = normalizeText(item?.id || item?.conto_id)
    const itemCode = normalizeText(item?.codice || item?.code || item?.sigla || item?.conto_codice)
    return Boolean((id && itemId === id) || (code && itemCode === code) || (id && itemCode === id))
  })

  if (match) {
    return {
      id: normalizeText(match.id || match.conto_id),
      codice: normalizeText(match.codice || match.code || match.sigla || match.conto_codice),
      descrizione: normalizeText(
        match.descrizione || match.description || match.nome || match.denominazione || match.conto_descrizione
      ),
    }
  }

  if (catalog.length || (!id && !code)) return null
  return { id: id || code, codice: code, descrizione: description }
}

function templateRowsOf(causale = {}) {
  const rows = causale?.righe_prima_nota_template || causale?.righePrimaNotaTemplate || causale?.righe_prima_nota
  return Array.isArray(rows) ? rows.filter((row) => row?.attiva !== false) : []
}

function accountFromTemplateRow(row = {}, pianoConti = []) {
  return findAccount(pianoConti, {
    id: row.conto_id || row.contoId,
    codice: row.conto_codice || row.contoCodice,
    descrizione: row.conto_descrizione || row.contoDescrizione,
  })
}

function resolveDeferredAccount(causale = {}, pianoConti = []) {
  const configured = causale.conto_iva_esig_differita ||
    causale.contoIvaEsigDifferita ||
    causale.conto_iva_differita ||
    causale.contoIvaDifferita
  const direct = findAccount(pianoConti, configured)
  if (direct) return direct

  const row = templateRowsOf(causale).find((item) => {
    const role = normalizeText(item?.ruolo).toLowerCase()
    return ['iva_differita', 'iva_sospesa', 'iva_per_cassa_differita'].includes(role)
  })
  return row ? accountFromTemplateRow(row, pianoConti) : null
}

function resolveTemplateOrdinaryAccount(causale = {}, deferredAccount = null, pianoConti = []) {
  const deferredKey = accountKey(deferredAccount)
  const rows = templateRowsOf(causale)
  const explicit = rows.find((item) => {
    const role = normalizeText(item?.ruolo).toLowerCase()
    return ['iva_ordinaria', 'iva_acquisti', 'iva_vendite', 'iva_detraibile'].includes(role)
  })
  if (explicit) return accountFromTemplateRow(explicit, pianoConti)

  const generic = rows
    .filter((item) => normalizeText(item?.ruolo).toLowerCase() === 'iva')
    .map((item) => accountFromTemplateRow(item, pianoConti))
    .find((account) => account && accountKey(account) !== deferredKey)
  return generic || null
}

function resolveCausaleIva(causaliIva = [], reference = '') {
  const ref = normalizeText(reference)
  if (!ref) return null
  return (Array.isArray(causaliIva) ? causaliIva : []).find((item) => {
    const candidates = [item?.id, item?.codice, item?.code, item?.sigla].map(normalizeText)
    return candidates.includes(ref)
  }) || null
}

function resolveDirection(items = [], header = {}) {
  const types = new Set()
  items.forEach((item) => {
    ;(Array.isArray(item?.righeIvaOriginarie) ? item.righeIvaOriginarie : []).forEach((row) => {
      const type = normalizeText(row?.tipo).toLowerCase()
      if (type === 'acquisto') types.add('passivo')
      if (type === 'vendita') types.add('attivo')
    })
    const subjectType = normalizeText(item?.soggettoTipo).toLowerCase()
    if (subjectType === 'fornitore') types.add('passivo')
    if (subjectType === 'cliente') types.add('attivo')
  })
  const headerType = normalizeText(header?.clienteFornitoreTipo || header?.cliente_fornitore_tipo).toLowerCase()
  if (!types.size && headerType === 'fornitore') types.add('passivo')
  if (!types.size && headerType === 'cliente') types.add('attivo')
  return types.size === 1 ? Array.from(types)[0] : ''
}

function buildRow({ id, account, side, value, description }) {
  const formatted = amount(value).toFixed(2)
  return {
    id,
    source: 'iva_per_cassa_giroconto',
    technicalDerived: true,
    templateGenerated: true,
    ruolo: 'iva',
    contoQuery: account.codice && account.descrizione
      ? `${account.codice} - ${account.descrizione}`
      : account.descrizione || account.codice || account.id,
    conto_id: account.id,
    conto_codice: account.codice,
    conto_descrizione: account.descrizione,
    descrizione: description,
    descrizione_riga: description,
    dare: side === 'dare' ? formatted : '',
    avere: side === 'avere' ? formatted : '',
    lato: side,
    modificabile: false,
    obbligatoria: true,
    attiva: true,
  }
}

export function buildIvaPerCassaGirocontoRows({
  rows = [],
  causale = {},
  behavior = {},
  header = {},
  partitarioPreview = {},
  causaliIva = [],
  pianoConti = [],
} = {}) {
  const baseRows = (Array.isArray(rows) ? rows : []).filter((row) => row?.source !== 'iva_per_cassa_giroconto')
  const policy = buildCausaleContabilePolicy(causale)
  const items = Array.isArray(partitarioPreview?.items)
    ? partitarioPreview.items.filter((item) => item?.iva_per_cassa && amount(item?.ivaDaRilasciareOra) > 0)
    : []
  const active = Boolean(
    partitarioPreview?.active &&
    items.length &&
    policy.ivaPerCassa &&
    policy.isPagamentoIncasso &&
    (behavior?.showIvaPerCassaPreview ?? true)
  )
  if (!active) return { active: false, rows: baseRows, girocontoRows: [], blockers: [] }

  const blockers = []
  const direction = resolveDirection(items, header)
  if (!direction) blockers.push('giroconto IVA per cassa: natura attiva/passiva della partita non determinabile')

  const deferredAccount = resolveDeferredAccount(causale, pianoConti)
  if (!deferredAccount) {
    blockers.push('giroconto IVA per cassa: conto IVA differita/sospesa non configurato o non risolvibile')
  }

  const templateOrdinaryAccount = resolveTemplateOrdinaryAccount(causale, deferredAccount, pianoConti)
  const ordinaryAmounts = new Map()
  items.forEach((item) => {
    const originRows = Array.isArray(item?.righeIvaOriginarie) ? item.righeIvaOriginarie : []
    if (!originRows.length && templateOrdinaryAccount) {
      const key = accountKey(templateOrdinaryAccount)
      ordinaryAmounts.set(key, {
        account: templateOrdinaryAccount,
        value: round2((ordinaryAmounts.get(key)?.value || 0) + amount(item.ivaDaRilasciareOra)),
      })
      return
    }
    originRows.forEach((origin) => {
      const causaleIva = resolveCausaleIva(causaliIva, origin.causaleIvaId || origin.causale_iva_id)
      const policyIva = causaleIva ? buildCausaleIvaPolicy(causaleIva) : null
      const account = findAccount(
        pianoConti,
        origin.contoIva || origin.conto_iva_id || policyIva?.contoIva
      ) || templateOrdinaryAccount
      if (!account) return
      const key = accountKey(account)
      ordinaryAmounts.set(key, {
        account,
        value: round2((ordinaryAmounts.get(key)?.value || 0) + amount(origin.ivaDaRilasciareOra)),
      })
    })
  })

  const totalRelease = round2(items.reduce((total, item) => total + amount(item.ivaDaRilasciareOra), 0))
  const ordinaryTotal = round2(Array.from(ordinaryAmounts.values()).reduce((total, item) => total + item.value, 0))
  if (!ordinaryAmounts.size || Math.abs(ordinaryTotal - totalRelease) > 0.01) {
    blockers.push('giroconto IVA per cassa: conto IVA ordinaria non configurato o non risolvibile')
  }

  if (blockers.length) {
    return { active: true, rows: baseRows, girocontoRows: [], blockers: Array.from(new Set(blockers)) }
  }

  const ordinarySide = direction === 'passivo' ? 'dare' : 'avere'
  const deferredSide = direction === 'passivo' ? 'avere' : 'dare'
  const girocontoRows = Array.from(ordinaryAmounts.values()).map((entry, index) =>
    buildRow({
      id: `iva-per-cassa-ordinaria-${index + 1}`,
      account: entry.account,
      side: ordinarySide,
      value: entry.value,
      description: direction === 'passivo' ? 'IVA acquisti esigibile' : 'IVA vendite esigibile',
    })
  )
  girocontoRows.push(buildRow({
    id: 'iva-per-cassa-differita',
    account: deferredAccount,
    side: deferredSide,
    value: totalRelease,
    description: 'Rilascio IVA differita per incasso/pagamento',
  }))

  return {
    active: true,
    rows: [...baseRows, ...girocontoRows].map((row, index) => ({ ...row, riga_numero: index + 1 })),
    girocontoRows,
    blockers: [],
    direction,
    totalRelease,
  }
}
