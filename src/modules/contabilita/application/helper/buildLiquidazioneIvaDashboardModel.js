import { boundsMensile, boundsTrimestrale } from '../liquidazioneIvaClient.js'

function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100
}

function formatTimestamp(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const gg = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${gg}/${mm}/${aaaa} ${hh}:${min}`;
}

export function buildLiquidazioneIvaDashboardModel({
  societaAttiva,
  periodParams,
  liquidazioniList = [],
  currentCalc = null,
  operatore = null,
  lastCalcTimestamp = null
}) {
  const societaId = societaAttiva?.id || null
  const basePeriodicita = societaAttiva?.tipo_liquidazione_iva || 'mensile'
  const periodicita = periodParams?.tipo_periodo || basePeriodicita
  const anno = periodParams?.anno || new Date().getFullYear()
  const periodo = periodParams?.periodo || 1

  // Trova se esiste già una liquidazione consolidata o definitiva nel DB per questo periodo
  const savedRecord = liquidazioniList.find(l => {
    const p = l.periodicita || l.tipo_periodo
    const lPeriodo = l.periodicita === 'mensile' ? l.mese : l.trimestre
    return (
      String(l.societa_id) === String(societaId) &&
      String(p).toLowerCase() === String(periodicita).toLowerCase() &&
      Number(l.anno) === Number(anno) &&
      Number(lPeriodo) === Number(periodo)
    )
  })

  // Determina lo stato del ciclo di vita
  let statoLiquidazione = 'Anteprima' // default se non salvato
  let savedOperator = null
  let updatedTime = null

  if (savedRecord) {
    if (savedRecord.stato === 'definitiva') {
      statoLiquidazione = 'Definitiva'
    } else {
      statoLiquidazione = 'Consolidata'
    }
    savedOperator = savedRecord.operatore_nome || savedRecord.note?.match(/Operatore:\s*([^\n|]+)/)?.[1]?.trim()
    updatedTime = savedRecord.updated_at
  }

  // Prepara i KPI basandosi sul calcolo corrente (in memoria) o sui dati salvati
  const ivaVenditeLorda = currentCalc ? round2(currentCalc.ivaVenditeLorda || 0) : round2(savedRecord?.iva_debito || 0)
  const ivaSplitPayment = currentCalc ? round2(currentCalc.ivaSplitPayment || 0) : 0
  const ivaDebitoEffettiva = currentCalc ? round2(currentCalc.ivaDebitoEffettiva || 0) : round2(savedRecord?.iva_debito || 0)
  const ivaAcquisti = currentCalc ? round2(currentCalc.ivaAcquistiDetraibile || currentCalc.ivaAcquisti || 0) : round2(savedRecord?.iva_credito || 0)
  const saldoPeriodo = currentCalc ? round2(currentCalc.saldoPeriodo || 0) : round2((savedRecord?.saldo !== undefined ? savedRecord.saldo : ivaDebitoEffettiva - ivaAcquisti))

  const esitoLabel = saldoPeriodo > 0 ? 'IVA a debito' : 'IVA a credito'

  // Statistiche righe
  const registriInclusiCount = currentCalc?.righeIncluseCount ?? 0
  const registriEsclusiCount = currentCalc?.righeEscluseCount ?? 0
  const righeEscluseDifferitaCount = currentCalc?.righeEscluse?.filter(r => r.motivo === 'esigibilita_differita').length ?? 0

  const operatoreLabel = savedOperator || (operatore?.nome ? `${operatore.nome} ${operatore.cognome || ''}`.trim() : 'Operatore Studio')

  // Formatta storico per la tabella
  const storico = liquidazioniList.map(l => {
    const label = l.periodicita === 'mensile' ? `Mese ${l.mese} ${l.anno}` : `${l.trimestre}° Trimestre ${l.anno}`
    const isDefinitiva = l.stato === 'definitiva'
    const isConsolidata = l.stato === 'provvisoria'
    const statoLabel = isDefinitiva ? 'DEFINITIVA' : (isConsolidata ? 'CONSOLIDATA' : 'ANTEPRIMA')

    const sVal = Number(l.saldo || 0)
    const dovuta = sVal > 0 ? sVal : 0
    const credito = sVal < 0 ? Math.abs(sVal) : 0

    return {
      id: l.id,
      periodoLabel: label,
      periodo: l.periodicita === 'mensile' ? l.mese : l.trimestre,
      anno: l.anno,
      periodicita: l.periodicita,
      stato: l.stato,
      statoLabel,
      ivaDovuta: dovuta,
      credito,
      lipe: l.stato === 'definitiva' ? `LIPE-${l.anno}-${String(l.id).slice(0,8).toUpperCase()}` : '—',
      operatore: l.note?.match(/Operatore:\s*([^\n|]+)/)?.[1]?.trim() || 'Patrik Alaimo',
      dataAggiornamento: formatTimestamp(l.updated_at)
    }
  })

  return {
    societaId,
    periodicita,
    anno,
    periodo,
    statoLiquidazione,
    kpis: {
      ivaVenditeLorda,
      ivaSplitPayment,
      ivaDebitoEffettiva,
      ivaAcquisti,
      saldoPeriodo,
      esitoLabel
    },
    meta: {
      registriInclusiCount,
      registriEsclusiCount,
      righeEscluseDifferitaCount,
      ultimoAggiornamento: formatTimestamp(updatedTime || lastCalcTimestamp),
      operatoreStudio: operatoreLabel,
      metodoCalcolo: 'Prevalenza competenza / Pro-rata: 100%'
    },
    storico
  }
}
