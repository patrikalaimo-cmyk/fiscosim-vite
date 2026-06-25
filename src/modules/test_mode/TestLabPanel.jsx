import { useState, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import {
  isDemoCompany,
  TEST_LAB_PHASE_24B,
} from './demoCompanyGuard.js'
import {
  ensureTestLabDemoCompany,
  isAdminOrOwnerForTestLab,
  TEST_LAB_DEMO_COMPANY_CODE,
  TEST_LAB_DEMO_COMPANY_DENOMINATION,
  buildTestLabDemoCompanyPayload,
} from './demoCompanyProvision.js'
import { buildOrdinariaAcquisto10CaseDefinitions } from './testLabOrdinariaAcquistoCases.js'
import {
  runTestLabPreparaOrdinariaAcquisto,
  writeTestLabImportSnapshot,
  CICLO_COMPLETO_DISABLED_REASON,
} from './testLabPreparaWorkflow.js'

const STATO_COLOR = {
  verde: '#34c27a',
  giallo: 'var(--gold)',
  rosso: '#e05252',
}

const OTHER_SCENARIOS = [
  { id: 'ordinarie_vendita', name: 'Fatture Ordinarie Vendita', icon: '📤', phase: '24C' },
  { id: 'note_credito', name: 'Note Credito', icon: '🔄', phase: '24C' },
  { id: 'multi_aliquota', name: 'Multi-aliquota (altri)', icon: '📊', phase: '24C' },
  { id: 'iva_cassa', name: 'IVA per Cassa', icon: '⏱️', phase: '24C' },
  { id: 'split_payment', name: 'Split Payment', icon: '🏛️', phase: '24C' },
  { id: 'massivo_completo', name: 'Test Massivo Completo', icon: '💣', phase: '24C' },
  { id: 'cespiti', name: 'Cespiti Leggeri', icon: '🏢', phase: '24C', note: 'Aggancio parziale' },
]

function ReportPanel({ report }) {
  if (!report) return null
  const color = STATO_COLOR[report.stato] || 'var(--mu)'
  return (
    <div style={{
      marginTop: '.85rem', padding: '.75rem .85rem', borderRadius: 8,
      border: `1px solid ${color}55`, background: `${color}11`,
    }}>
      <div style={{ fontWeight: 700, fontSize: '.85rem', color, marginBottom: '.5rem' }}>
        Report esito — {report.stato?.toUpperCase()}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.35rem', fontSize: '.72rem' }}>
        <div>Scenario: <strong>{report.scenario}</strong></div>
        <div>Società demo: <strong>{report.societaDemo}</strong></div>
        <div>Casi previsti: <strong>{report.casiPrevisti}</strong></div>
        <div>Casi preparati: <strong>{report.casiPreparati}</strong></div>
        <div>Staging/working: <strong>{report.documentiStagingWorking}</strong></div>
        <div>Contabilizzati: <strong>{report.documentiContabilizzati}</strong></div>
        <div>Prime note: <strong>{report.primeNoteCreate}</strong></div>
        <div>Registri IVA: <strong>{report.registriIvaCreati}</strong></div>
        <div>Partitario: <strong>{report.partitarioCreato}</strong></div>
      </div>
      {report.errori?.length > 0 && (
        <div style={{ marginTop: '.5rem', fontSize: '.72rem', color: '#e05252' }}>
          Errori: {report.errori.join('; ')}
        </div>
      )}
      {report.warning?.length > 0 && (
        <div style={{ marginTop: '.35rem', fontSize: '.72rem', color: 'var(--gold)' }}>
          Warning: {report.warning.join('; ')}
        </div>
      )}
      {report.casiPreparati > 0 && (
        <div style={{ marginTop: '.5rem', fontSize: '.72rem', color: 'var(--cy)' }}>
          Snapshot salvato in sessionStorage — apri Import Contabilità sulla stessa società demo per vedere la working table.
        </div>
      )}
    </div>
  )
}

/**
 * Test Lab — Fase 24B: Prepara test fattura ordinaria acquisto (10 casi).
 */
export function TestLabPanel({ societaId, currentSocieta, utente, societaList = [], onDemoCompanyReady }) {
  const isDemo = isDemoCompany(currentSocieta)
  const canManageDemo = isAdminOrOwnerForTestLab(utente)
  const demoExistsInList = societaList.some((s) => s.codice === TEST_LAB_DEMO_COMPANY_CODE)
  const phase = TEST_LAB_PHASE_24B
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [report, setReport] = useState(null)
  const [lastError, setLastError] = useState(null)
  const [demoMessage, setDemoMessage] = useState(null)

  const casePreview = isDemo && currentSocieta
    ? buildOrdinariaAcquisto10CaseDefinitions(currentSocieta).map((d) => ({
        caseId: d.caseId,
        label: d.label,
        filename: d.filename,
        meta: d.meta,
      }))
    : []

  const handleEnsureDemoCompany = useCallback(async () => {
    if (!canManageDemo || demoBusy) return
    setDemoBusy(true)
    setLastError(null)
    setDemoMessage(null)
    try {
      const result = await ensureTestLabDemoCompany({ db: sb, utente })
      if (typeof onDemoCompanyReady === 'function') {
        await onDemoCompanyReady(result.societa)
      }
      setDemoMessage(
        result.created
          ? `Società demo creata (${TEST_LAB_DEMO_COMPANY_CODE}) e selezionata. Avvia manualmente "Prepara test" quando pronto.`
          : `Società demo esistente agganciata (${TEST_LAB_DEMO_COMPANY_CODE}). Avvia manualmente "Prepara test" quando pronto.`
      )
    } catch (err) {
      setLastError(err?.message || String(err))
    } finally {
      setDemoBusy(false)
    }
  }, [canManageDemo, demoBusy, onDemoCompanyReady, utente])

  const handlePrepara = useCallback(async () => {
    if (!isDemo || !societaId || !currentSocieta || busy) return
    setBusy(true)
    setLastError(null)
    setReport(null)
    try {
      const result = await runTestLabPreparaOrdinariaAcquisto({
        societa: currentSocieta,
        societaId,
      })
      writeTestLabImportSnapshot(societaId, result.importResult, result.automationMetaByRowId)
      setReport(result.report)
    } catch (err) {
      setLastError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }, [isDemo, societaId, currentSocieta, busy])

  const prepareDisabled = !isDemo || !societaId || busy
  const prepareTitle = !societaId
    ? 'Seleziona una società'
    : !isDemo
      ? 'Società non DEMO — richiesto codice __TEST__ o test_'
      : ''

  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem', border: isDemo ? '1px solid rgba(52,194,122,.35)' : '1px solid rgba(224,82,82,.45)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '.85rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--gold)' }}>🧪 Test Lab Contabile — Fase {phase.id}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.25rem' }}>
            Prepara test su motore Import reale — staging/working table only, zero contabilizzazione.
          </div>
        </div>
        <span style={{
          fontSize: '.72rem', fontWeight: 700, borderRadius: 20, padding: '.25rem .65rem',
          background: 'rgba(52,194,122,.12)', color: '#34c27a',
          border: '1px solid rgba(52,194,122,.35)',
        }}>
          Prepara test attivo
        </span>
      </div>

      {!societaId && (
        <div className="alert alert-warn" style={{ marginBottom: '.75rem' }}>
          Seleziona una società demo oppure crea/aggancia la società demo FiscoSim.
        </div>
      )}

      {!isDemo && canManageDemo && (
        <div style={{
          background: 'rgba(200,164,94,.08)', border: '1px solid rgba(200,164,94,.35)',
          borderRadius: 8, padding: '.75rem .85rem', marginBottom: '.85rem',
        }}>
          <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--gold)', marginBottom: '.35rem' }}>
            Società demo Test Lab non selezionata
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.55rem' }}>
            Codice richiesto: <code>{TEST_LAB_DEMO_COMPANY_CODE}</code> · {TEST_LAB_DEMO_COMPANY_DENOMINATION}
            {demoExistsInList ? ' · già presente in elenco società' : ' · non ancora presente'}
          </div>
          <button
            type="button"
            className="btn"
            disabled={demoBusy}
            onClick={handleEnsureDemoCompany}
            style={{ fontSize: '.78rem' }}
          >
            {demoBusy ? '⏳ Creazione/aggancio...' : 'Crea società demo FiscoSim'}
          </button>
          <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.45rem' }}>
            Idempotente: se esiste già non duplica. Nessun test parte automaticamente.
          </div>
        </div>
      )}

      {!isDemo && !canManageDemo && societaId && (
        <div className="alert alert-warn" style={{ marginBottom: '.75rem' }}>
          Solo Admin/Owner possono creare la società demo Test Lab. Seleziona una società con codice <code>__TEST__</code> o <code>test_</code>.
        </div>
      )}

      {demoMessage && (
        <div className="alert alert-info" style={{ marginBottom: '.75rem', fontSize: '.78rem' }}>
          {demoMessage}
        </div>
      )}

      {societaId && isDemo && (
        <div style={{
          background: 'rgba(52,194,122,.08)', border: '1px solid rgba(52,194,122,.35)',
          borderRadius: 8, padding: '.65rem .85rem', marginBottom: '.85rem', fontWeight: 700, color: '#34c27a', fontSize: '.85rem',
        }}>
          SOCIETÀ DEMO — DATI DI TEST
          <span style={{ display: 'block', fontWeight: 400, fontSize: '.75rem', color: 'var(--mu)', marginTop: '.25rem' }}>
            Codice: {currentSocieta?.codice} · {currentSocieta?.denominazione}
          </span>
        </div>
      )}

      {societaId && !isDemo && (
        <div className="alert" style={{ marginBottom: '.85rem', background: 'rgba(224,82,82,.08)', borderColor: 'rgba(224,82,82,.4)', color: '#e05252' }}>
          <strong>Blocco Test Lab.</strong> Società non DEMO. Richiesto codice con prefisso <code>__TEST__</code> o <code>test_</code>.
        </div>
      )}

      {/* Scenario abilitato 24B */}
      <div style={{
        background: 'var(--s2)', border: '1px solid rgba(52,194,122,.35)', borderRadius: 8,
        padding: '.75rem .85rem', marginBottom: '.75rem',
      }}>
        <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: '.35rem' }}>
          📥 Fattura ordinaria acquisto — 10 casi
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.65rem' }}>
          Modalità: <strong>Prepara test</strong> — genera XML, parsing reale, staging in sessionStorage. Nessuna prima nota.
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={prepareDisabled}
            title={prepareTitle}
            onClick={handlePrepara}
            style={{ fontSize: '.78rem', opacity: prepareDisabled ? 0.5 : 1 }}
          >
            {busy ? '⏳ Preparazione...' : '▶ Prepara test — Fattura ordinaria acquisto'}
          </button>
          <button
            type="button"
            className="btn-sec"
            disabled
            title={CICLO_COMPLETO_DISABLED_REASON}
            style={{ fontSize: '.72rem', opacity: 0.45, cursor: 'not-allowed' }}
          >
            Esegui ciclo completo (disabilitato)
          </button>
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.45rem' }}>
          {CICLO_COMPLETO_DISABLED_REASON}
        </div>
      </div>

      {lastError && (
        <div className="alert" style={{ marginBottom: '.75rem', color: '#e05252' }}>
          {lastError}
        </div>
      )}

      <ReportPanel report={report} />

      {/* Elenco 10 casi */}
      <div style={{ fontSize: '.72rem', color: 'var(--mu)', margin: '.85rem 0 .45rem' }}>
        10 casi generabili (scenario 24B):
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.45rem', marginBottom: '.75rem' }}>
        {casePreview.map((c) => (
          <div key={c.caseId} style={{
            background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8,
            padding: '.45rem .55rem', fontSize: '.72rem',
          }}>
            <div style={{ fontWeight: 600 }}>{c.caseId} — {c.label}</div>
            <div style={{ color: 'var(--mu)', fontSize: '.65rem', marginTop: '.15rem' }}>{c.filename}</div>
            <div style={{ marginTop: '.2rem' }}>
              {c.meta?.fornitore} · P.IVA {c.meta?.partitaIva}
            </div>
            <div style={{ fontSize: '.65rem', color: 'var(--cy)' }}>
              Imp. {c.meta?.imponibile} · IVA {c.meta?.iva} · Tot. {c.meta?.totale} · Causale {c.meta?.causaleSuggerita}
            </div>
          </div>
        ))}
      </div>

      {/* Altri scenari disabilitati */}
      <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.45rem' }}>
        Altri scenari (disabilitati):
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.45rem' }}>
        {OTHER_SCENARIOS.map((s) => (
          <div
            key={s.id}
            style={{
              opacity: 0.45, pointerEvents: 'none', background: 'var(--s2)',
              border: '1px solid var(--bd)', borderRadius: 8, padding: '.45rem .55rem', fontSize: '.72rem',
            }}
          >
            {s.icon} {s.name} · fase {s.phase}
          </div>
        ))}
      </div>
    </div>
  )
}
