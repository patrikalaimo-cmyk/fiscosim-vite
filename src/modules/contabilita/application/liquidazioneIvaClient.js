function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v)
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? round2(n) : 0
}

export function boundsMensile(year, month) {
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0)
  return {
    periodo_inizio: from.toISOString().slice(0, 10),
    periodo_fine: to.toISOString().slice(0, 10),
  }
}

export function boundsTrimestrale(year, trimestre) {
  const startMonth = (trimestre - 1) * 3 + 1
  const endMonth = trimestre * 3
  const from = new Date(year, startMonth - 1, 1)
  const to = new Date(year, endMonth, 0)
  return {
    periodo_inizio: from.toISOString().slice(0, 10),
    periodo_fine: to.toISOString().slice(0, 10),
  }
}

export function aggregateRegistriIvaRows(rows) {
  let iva_debito = 0
  let iva_credito = 0
  const list = Array.isArray(rows) ? rows : []
  let righeConsiderateCount = 0

  for (const r of list) {
    const esig = String(r?.esigibilita || '').trim().toLowerCase()
    if (esig === 'differita') {
      continue
    }

    const tipo = String(r?.tipo || '').toLowerCase()
    if (tipo === 'vendita') {
      iva_debito += toNum(r?.iva)
      righeConsiderateCount++
    } else if (tipo === 'acquisto') {
      iva_credito += toNum(r?.iva_detraibile)
      righeConsiderateCount++
    }
  }

  iva_debito = round2(iva_debito)
  iva_credito = round2(iva_credito)
  const saldo = round2(iva_debito - iva_credito)
  return { iva_debito, iva_credito, saldo, righe_considerate: righeConsiderateCount }
}

export function buildLiquidazionePayload({ periodicita, anno, mese = null, trimestre = null, agg, note }) {
  let periodo_inizio
  let periodo_fine
  if (periodicita === 'mensile') {
    const b = boundsMensile(anno, mese)
    periodo_inizio = b.periodo_inizio
    periodo_fine = b.periodo_fine
  } else {
    const b = boundsTrimestrale(anno, trimestre)
    periodo_inizio = b.periodo_inizio
    periodo_fine = b.periodo_fine
  }
  return {
    periodicita,
    anno,
    mese: periodicita === 'mensile' ? mese : null,
    trimestre: periodicita === 'trimestrale' ? trimestre : null,
    periodo_inizio,
    periodo_fine,
    iva_debito: agg.iva_debito,
    iva_credito: agg.iva_credito,
    saldo: agg.saldo,
    note: note || null,
    updated_at: new Date().toISOString(),
  }
}

export function mapLiquidazioneForUi(l) {
  if (!l) return null
  const periodo = l.periodicita === 'mensile' ? l.mese : l.trimestre
  const saldo = Number(l.saldo || 0)
  return {
    ...l,
    tipo_periodo: l.periodicita,
    periodo,
    iva_vendite: l.iva_debito,
    iva_acquisti: l.iva_credito,
    iva_dovuta: saldo > 0 ? saldo : 0,
    credito_da_riportare: saldo < 0 ? Math.abs(saldo) : 0,
    stato: l.stato || 'calcolata',
  }
}

