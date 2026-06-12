import { aggregateVatRegisterEntries } from './iva/aggregateVatRegisterEntries.js'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { calcoloLiquidazioneIvaDefinitiva } from '../domain/iva/calcoloLiquidazioneIvaDefinitiva.js'

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

export function aggregateRegistriIvaRows(rows, options = {}) {
  return aggregateVatRegisterEntries(rows, options)
}

export function buildLiquidazionePayload({ societaId, periodicita, anno, mese = null, trimestre = null, agg, note }) {
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
    societa_id: societaId || null,
    periodicita,
    anno,
    mese: periodicita === 'mensile' ? mese : null,
    trimestre: periodicita === 'trimestrale' ? trimestre : null,
    periodo_inizio,
    periodo_fine,
    iva_debito: agg.iva_debito_effettiva ?? agg.ivaDebitoEffettiva ?? agg.iva_debito,
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

export async function getRegistriIvaLiquidabili({ societaId, periodoInizio, periodoFine }) {
  const { data, error } = await contabilitaRepo.getRegistriIvaByPeriodo(societaId, periodoInizio, periodoFine)
  return { data, error }
}

export async function fetchLiquidazioneIvaDefinitiva({ societaId, periodoInizio, periodoFine }) {
  const { data, error } = await contabilitaRepo.getLiquidazioneIvaByPeriodo({ societaId, periodoInizio, periodoFine })
  return { data: mapLiquidazioneForUi(data), error }
}

export async function fetchRigheLiquidazioneIvaSnapshot(liquidazioneId) {
  const { data, error } = await contabilitaRepo.getRigheLiquidazioneIvaSnapshot(liquidazioneId)
  return { data, error }
}

export async function consolidaLiquidazioneIvaDefinitiva({
  societaId,
  periodoInizio,
  periodoFine,
  tipoPeriodicita,
  operatoreStudioId,
  motivo,
  options = {},
}) {
  const { data: rows, error: rowsErr } = await contabilitaRepo.getRegistriIvaByPeriodo(societaId, periodoInizio, periodoFine)
  if (rowsErr) return { data: null, error: rowsErr }

  const payloadCalcolo = calcoloLiquidazioneIvaDefinitiva(rows || [], {
    societaId,
    periodoInizio,
    periodoFine,
    periodicita: tipoPeriodicita,
    ...options,
  })

  const { data, error } = await contabilitaRepo.consolidaLiquidazioneIvaDefinitiva({
    societaId,
    periodoInizio,
    periodoFine,
    tipoPeriodicita,
    operatoreStudioId,
    motivo,
    payloadCalcolo,
  })

  return { data, error }
}
