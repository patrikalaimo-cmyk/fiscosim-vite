import { TEST_LAB_PHASE_24A, isDemoCompany } from './demoCompanyGuard.js'

const SCENARIOS_24A = [
  { id: 'ordinarie_acquisto', name: 'Fatture Ordinarie Acquisto', icon: '📥', phase: '24B' },
  { id: 'ordinarie_vendita', name: 'Fatture Ordinarie Vendita', icon: '📤', phase: '24B' },
  { id: 'note_credito', name: 'Note Credito', icon: '🔄', phase: '24B' },
  { id: 'multi_aliquota', name: 'Multi-aliquota', icon: '📊', phase: '24B' },
  { id: 'iva_cassa', name: 'IVA per Cassa', icon: '⏱️', phase: '24B' },
  { id: 'split_payment', name: 'Split Payment', icon: '🏛️', phase: '24B' },
  { id: 'reverse_estero', name: 'Reverse Charge / Estero', icon: '🌍', phase: '24B' },
  { id: 'parcelle_ritenute', name: 'Parcelle & Ritenute', icon: '💼', phase: '24B' },
  { id: 'forfettari_esenti', name: 'Forfettari ed Esenti IVA', icon: '🆓', phase: '24B' },
  { id: 'massivo_completo', name: 'Test Massivo Completo', icon: '💣', phase: '24C' },
  { id: 'cespiti', name: 'Cespiti Leggeri', icon: '🏢', phase: '24C', note: 'Aggancio parziale Fase 16 — non studio-grade' },
]

/**
 * UI minima Test Lab — Fase 24A.
 * Scenari visibili ma disabilitati; nessun import, commit, persistenza o pulizia.
 */
export function TestLabPanel({ societaId, currentSocieta }) {
  const isDemo = isDemoCompany(currentSocieta)
  const phase = TEST_LAB_PHASE_24A

  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem', border: isDemo ? '1px solid rgba(52,194,122,.35)' : '1px solid rgba(224,82,82,.45)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '.85rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--gold)' }}>🧪 Test Lab Contabile — Fase {phase.id}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginTop: '.25rem' }}>
            Fondazione sicura: recinto demo attivo. Nessun ciclo contabile in questa fase.
          </div>
        </div>
        <span style={{
          fontSize: '.72rem', fontWeight: 700, borderRadius: 20, padding: '.25rem .65rem',
          background: phase.operational ? 'rgba(52,194,122,.12)' : 'rgba(200,164,94,.12)',
          color: phase.operational ? '#34c27a' : 'var(--gold)',
          border: `1px solid ${phase.operational ? 'rgba(52,194,122,.35)' : 'rgba(200,164,94,.35)'}`,
        }}>
          {phase.operational ? 'Operativo' : 'Solo recinto sicurezza'}
        </span>
      </div>

      {!societaId && (
        <div className="alert alert-warn" style={{ marginBottom: '.75rem' }}>
          Seleziona una società per verificare il criterio DEMO.
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
          <strong>Blocco Test Lab.</strong> La società selezionata non è DEMO.
          Creare o selezionare una società con codice che inizi per <code>__TEST__</code> o <code>test_</code>.
          Nessuna operazione Test Lab è consentita su società reali.
        </div>
      )}

      <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.65rem' }}>
        Scenari (visibili, disabilitati in {phase.id}):
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.5rem' }}>
        {SCENARIOS_24A.map((scenario) => (
          <div
            key={scenario.id}
            title={`Disponibile in fase ${scenario.phase}`}
            style={{
              opacity: 0.55, cursor: 'not-allowed', pointerEvents: 'none',
              background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8,
              padding: '.55rem .65rem', fontSize: '.78rem',
            }}
          >
            <span style={{ marginRight: '.35rem' }}>{scenario.icon}</span>
            <span style={{ fontWeight: 600 }}>{scenario.name}</span>
            <div style={{ fontSize: '.65rem', color: 'var(--mu)', marginTop: '.2rem' }}>
              Disabilitato · fase {scenario.phase}
              {scenario.note ? ` · ${scenario.note}` : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '.85rem', fontSize: '.72rem', color: 'var(--mu)', lineHeight: 1.5 }}>
        Vietato in {phase.id}: generazione fatture, import, contabilizzazione, pulizia dati, delete.
        Riconciliazione bancaria: bloccata. Cespiti: aggancio leggero parziale (Fase 16), non completo.
      </div>
    </div>
  )
}
