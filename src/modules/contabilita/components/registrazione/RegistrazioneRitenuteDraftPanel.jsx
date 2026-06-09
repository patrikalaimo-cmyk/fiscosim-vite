import { useState } from 'react'
import * as contabilitaRepo from '../../data/contabilitaRepo.js'
import { REG_CARD_STYLE, REG_INPUT_STYLE, REG_SECTION_TITLE_STYLE, formatMoney } from './registrazioneUi.js'
import { parseRitenutaDecimalInput, resolveRitenutaNumericInputValue } from './ritenuteUiNumbers.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function toOptionLabel(row = {}) {
  return normalizeText(row.ragione_sociale || row.denominazione || row.nome || row.cognome || row.codice_fiscale || row.cf)
}

function toOptionId(row = {}) {
  return normalizeText(row.id)
}

function resolvePercipiente(value, percipienti = []) {
  const query = normalizeText(value).toLowerCase()
  if (!query) return null
  return (Array.isArray(percipienti) ? percipienti : []).find((item) => {
    const id = normalizeText(item?.id).toLowerCase()
    const label = normalizeText(item?.ragione_sociale || item?.denominazione || item?.nome || item?.cognome).toLowerCase()
    const cf = normalizeText(item?.codice_fiscale || item?.cf).toLowerCase()
    return id === query || label === query || cf === query || label.includes(query) || cf.includes(query) || query.includes(label)
  }) || null
}

function Field({ label, children, hint = '', span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'grid', gap: '.18rem', alignContent: 'start' }}>
      <label style={{ fontSize: '.66rem', fontWeight: 700, color: 'rgba(188,204,226,.78)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</label>
      {children}
      {hint ? <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.56)', lineHeight: 1.35 }}>{hint}</div> : null}
    </div>
  )
}

function SectionCard({ title, subtitle, children, style = {} }) {
  return (
    <section className="erp-flat-panel" style={{ padding: '.85rem .9rem', height: '100%', display: 'grid', gap: '.7rem', alignContent: 'start', ...style }}>
      <div style={{ display: 'grid', gap: '.08rem' }}>
        <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.96)' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: '.67rem', color: 'rgba(188,204,226,.7)', lineHeight: 1.35 }}>{subtitle}</div> : null}
      </div>
      {children}
    </section>
  )
}

function SummaryChip({ label, value, tone = 'neutral' }) {
  const color = tone === 'positive' ? '#8be28e' : tone === 'negative' ? '#ff8f8f' : 'var(--tx)'
  return (
    <div className="bdg" style={{ padding: '.35rem .55rem', display: 'inline-flex', alignItems: 'baseline', gap: '.35rem', borderRadius: 999, borderColor: 'rgba(96,165,250,.18)' }}>
      <span style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function CheckRow({ label, ok, detail = '' }) {
  const background = ok ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.08)'
  const borderColor = ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.2)'
  const dot = ok ? '#22c55e' : '#ef4444'
  return (
    <div style={{ display: 'grid', gap: '.12rem', padding: '.42rem .5rem', borderRadius: 12, border: `1px solid ${borderColor}`, background }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, boxShadow: `0 0 0 3px ${ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'}` }} />
        <strong style={{ fontSize: '.74rem', color: 'var(--tx)' }}>{label}</strong>
      </div>
      {detail ? <div style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.7)', lineHeight: 1.3 }}>{detail}</div> : null}
    </div>
  )
}

function ToneBox({ tone = 'neutral', title, body }) {
  const colors =
    tone === 'positive'
      ? { bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.3)', title: '#8be28e' }
      : tone === 'warning'
        ? { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)', title: '#f5c45f' }
        : tone === 'negative'
          ? { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.32)', title: '#ff8f8f' }
          : { bg: 'rgba(255,255,255,.03)', border: 'rgba(96,165,250,.14)', title: 'var(--tx)' }
  return (
    <div style={{ padding: '.58rem .65rem', borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bg, display: 'grid', gap: '.14rem' }}>
      <strong style={{ color: colors.title, fontSize: '.76rem' }}>{title}</strong>
      <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.76)', lineHeight: 1.35 }}>{body}</div>
    </div>
  )
}

function ToggleField({ label, checked, onChange, disabled, hint }) {
  return (
    <div style={{ display: 'grid', gap: '.18rem' }}>
      <label style={{ fontSize: '.66rem', fontWeight: 700, color: 'rgba(188,204,226,.78)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.55rem', padding: '.62rem .7rem', borderRadius: 14, border: '1px solid rgba(96,165,250,.16)', background: 'rgba(255,255,255,.03)' }}>
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange?.(event?.target?.checked)}
          disabled={disabled}
          style={{ width: 16, height: 16, accentColor: '#f7c843' }}
        />
        <span style={{ fontSize: '.74rem', color: 'var(--tx)' }}>{checked ? 'Sì' : 'No'}</span>
      </label>
      {hint ? <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.56)', lineHeight: 1.35 }}>{hint}</div> : null}
    </div>
  )
}

export function RegistrazioneRitenuteDraftPanel({
  ritenutaData,
  onChange,
  disabled = false,
  behavior = null,
  draft = null,
  percipienti = [],
  onRefreshPercipienti,
  header = {},
}) {
  const active = Boolean(behavior?.showRitenute)
  const mode = normalizeText(draft?.mode || ritenutaData?.mode || behavior?.ritenuteMode || 'documento').toLowerCase()
  const isPagamento = mode.includes('pagamento')
  const isDocumento = mode.includes('documento')
  const row = draft?.rows?.[0] || {}
  const percipienteOptions = Array.isArray(percipienti) ? percipienti : []
  const causaleOptions = Array.from(
    new Set(
      percipienteOptions
        .map((item) => normalizeText(item?.causale_prevalente || item?.causale_reddituale || item?.causaleCu || item?.causale || ''))
        .filter(Boolean)
    )
  )

  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickForm, setQuickForm] = useState({
    nome: '',
    cognome: '',
    ragione_sociale: '',
    codice_fiscale: '',
    data_nascita: '',
    residenza_fiscale: '',
    causale_prevalente: 'A',
    cassa_previdenziale: 4,
    soggetto_cassa_prev: true,
    regime_fiscale: 'ordinario',
    tipo_persona: 'fisica',
  })

  const setField = (field) => (event) => onChange?.(field, event?.target?.type === 'checkbox' ? event?.target?.checked : event?.target?.value ?? '')
  
  const setPrefilledPercipiente = (value) => {
    onChange?.('percipiente', value)
    const match = resolvePercipiente(value, percipienteOptions)
    if (!match) {
      onChange?.('percipienteId', '')
      onChange?.('percipienteNome', normalizeText(value))
      onChange?.('codiceFiscale', '')
      return
    }
    const causale = normalizeText(match.causale_prevalente || match.causale_reddituale || match.causaleCu || match.causale || '')
    if (match.id) onChange?.('percipienteId', match.id)
    if (match.codice_fiscale || match.cf) onChange?.('codiceFiscale', match.codice_fiscale || match.cf || '')
    if (match.ragione_sociale || match.denominazione || match.nome || match.cognome) onChange?.('percipienteNome', toOptionLabel(match))
    if (causale) {
      onChange?.('causaleCu', causale)
      onChange?.('causaleReddituale', causale)
    }
    const aliquota = match.aliquota_ritenuta ?? match.aliquotaRitenuta
    if (aliquota != null && aliquota !== '') onChange?.('aliquotaRitenuta', aliquota)
    const codiceTributo = match.codice_tributo ?? match.codiceTributo ?? match.metadata?.codice_tributo
    if (codiceTributo) onChange?.('codiceTributo', codiceTributo)
    const codiceCassa = match.codice_cassa ?? match.codiceCassa ?? match.metadata?.codice_cassa
    if (codiceCassa) onChange?.('codiceCassa', codiceCassa)
    onChange?.('escludiDaCu', !(match.soggetto_cu ?? match.inclusa_cu ?? match.metadata?.soggetto_cu ?? true))
    onChange?.('stato', match.stato_ritenuta_default ?? match.metadata?.stato_ritenuta_default ?? 'predisposto')
    
    // Auto-fill cassa previdenziale percentage if present in percipiente
    const cassa = match.cassa_previdenziale ?? match.cassaPrevidenziale ?? 0
    if (cassa > 0) {
      onChange?.('cassaPrevidenziale', cassa)
      onChange?.('aliquotaCassa', cassa)
    } else {
      onChange?.('cassaPrevidenziale', 0)
      onChange?.('aliquotaCassa', 0)
    }
  }

  const setCausale = (value) => {
    onChange?.('causaleCu', value)
    onChange?.('causaleReddituale', value)
  }

  const percipienteValue = row.percipienteNome ?? row.percipiente ?? ritenutaData.percipienteNome ?? ritenutaData.percipiente ?? ''
  const causaleValue = row.causaleCu ?? row.causaleReddituale ?? ritenutaData.causaleCu ?? ritenutaData.causaleReddituale ?? ''
  const importoCompensoValue = resolveRitenutaNumericInputValue(
    ritenutaData.manualCompensoOverride ? ritenutaData.importoCompenso : '',
    row.importoCompenso ?? row.imponibileReddito ?? row.imponibile
  )
  const quotaNonSoggettaValue = resolveRitenutaNumericInputValue(ritenutaData.quotaNonSoggetta, row.quotaNonSoggetta)
  const sommeNonSoggetteValue = resolveRitenutaNumericInputValue(ritenutaData.sommeNonSoggette, row.sommeNonSoggette)
  const codiceQuotaValue = row.codiceQuotaNonSoggetta ?? ritenutaData.codiceQuotaNonSoggetta ?? ''
  const codiceSommeValue = row.codiceSommeNonSoggette ?? ritenutaData.codiceSommeNonSoggette ?? ''
  const baseImponibileValue = resolveRitenutaNumericInputValue(
    ritenutaData.manualBaseOverride
      ? ritenutaData.baseImponibile ?? ritenutaData.baseRitenuta ?? ritenutaData.imponibileSoggettoRitenuta
      : '',
    row.baseImponibile ?? row.baseRitenuta ?? row.imponibileSoggettoRitenuta
  )
  const aliquotaValue = resolveRitenutaNumericInputValue(ritenutaData.aliquotaRitenuta, row.aliquotaRitenuta)
  const ritenutaValue = resolveRitenutaNumericInputValue(ritenutaData.manualRitenutaOverride ? ritenutaData.ritenuta : '', row.ritenuta)
  const nettoValue = resolveRitenutaNumericInputValue(ritenutaData.manualNettoOverride ? ritenutaData.netto : '', row.netto)
  const cassaValue = resolveRitenutaNumericInputValue(ritenutaData.cassaPrevidenziale, row.cassaPrevidenziale)
  const aliquotaCassaValue = resolveRitenutaNumericInputValue(ritenutaData.aliquotaCassa, row.aliquotaCassa)
  const importoCassaValue = resolveRitenutaNumericInputValue(ritenutaData.importoCassa, row.importoCassa)
  const codiceCassaValue = row.codiceCassa ?? ritenutaData.codiceCassa ?? ''
  const codiceTributoValue = row.codiceTributo ?? ritenutaData.codiceTributo ?? '1040'
  const statusValue = row.stato || ritenutaData.stato || 'predisposto'
  const draftValidation = draft?.validation || {}

  const handleOpenQuickCreate = () => {
    const value = percipienteValue || ''
    const isCompany = value.toLowerCase().includes('s.r.l.') || value.toLowerCase().includes('s.p.a.') || value.toLowerCase().includes('snc') || value.toLowerCase().includes('studio')
    
    setQuickForm({
      nome: isCompany ? '' : value.split(' ').slice(1).join(' ') || '',
      cognome: isCompany ? '' : value.split(' ')[0] || value,
      ragione_sociale: isCompany ? value : '',
      codice_fiscale: String(draft?.codiceFiscale || ritenutaData?.codiceFiscale || header?.codiceFiscale || '').trim().toUpperCase(),
      data_nascita: '',
      residenza_fiscale: '',
      causale_prevalente: 'A',
      cassa_previdenziale: 4,
      soggetto_cassa_prev: true,
      regime_fiscale: 'ordinario',
      tipo_persona: isCompany ? 'giuridica' : 'fisica',
    })
    setQuickCreateOpen(true)
  }

  const handleSaveQuickCreate = async () => {
    if (!(quickForm.codice_fiscale || '').trim()) {
      alert('Il codice fiscale è obbligatorio.')
      return
    }
    const displayName = quickForm.tipo_persona === 'giuridica' 
      ? quickForm.ragione_sociale 
      : `${quickForm.cognome} ${quickForm.nome}`.trim()
      
    if (!displayName) {
      alert('Il nome/ragione sociale è obbligatorio.')
      return
    }

    const record = {
      societa_id: ritenutaData.societaId || draft?.societaId || '',
      tipo_persona: quickForm.tipo_persona,
      codice_fiscale: quickForm.codice_fiscale.trim().toUpperCase(),
      ragione_sociale: quickForm.tipo_persona === 'giuridica' ? quickForm.ragione_sociale : displayName,
      nome: quickForm.tipo_persona === 'fisica' ? quickForm.nome : '',
      cognome: quickForm.tipo_persona === 'fisica' ? quickForm.cognome : '',
      data_nascita: quickForm.data_nascita || null,
      residenza_fiscale: quickForm.residenza_fiscale || '',
      causale_prevalente: quickForm.causale_prevalente,
      aliquota_ritenuta: 20,
      tipo_ritenuta: 'acconto',
      soggetto_ritenuta: true,
      soggetto_cu: true,
      soggetto_770: true,
      cassa_previdenziale: quickForm.soggetto_cassa_prev ? Number(quickForm.cassa_previdenziale) : 0,
      attivo: true
    }

    const { data: inserted, error } = await contabilitaRepo.insertPercipiente(record)
    if (error) {
      alert('Errore durante il salvataggio del percipiente: ' + error.message)
      return
    }

    setQuickCreateOpen(false)
    if (onRefreshPercipienti) {
      await onRefreshPercipienti()
    }
    setPrefilledPercipiente(displayName)
  }

  const summaryRows = [
    { label: 'Compenso', value: draft?.importoCompenso ?? importoCompensoValue ?? 0, tone: 'positive' },
    { label: 'Cassa', value: draft?.importoCassa ?? importoCassaValue ?? 0, tone: 'positive' },
    { label: 'Totale lordo', value: draft?.documentData?.totaleDocumento ?? 0, tone: 'positive' },
    { label: 'Ritenuta', value: draft?.ritenuta ?? ritenutaValue ?? 0, tone: 'negative' },
    { label: 'Netto da pagare', value: draft?.netto ?? nettoValue ?? 0, tone: 'positive' },
    { label: 'Partitario aperto', value: draft?.partitarioDraft?.importoAperto ?? draft?.documentData?.totaleDocumento ?? 0, tone: 'positive' },
  ]

  const checks = [
    { label: 'Percipiente collegato', ok: Boolean(draft?.percipienteRecord), detail: draft?.percipienteRecord?.ragione_sociale || percipienteValue || '' },
    { label: 'Codice fiscale presente', ok: Boolean(normalizeText(row.codiceFiscale || ritenutaData.codiceFiscale)), detail: normalizeText(row.codiceFiscale || ritenutaData.codiceFiscale) },
    { label: 'Causale reddituale valorizzata', ok: Boolean(normalizeText(causaleValue)), detail: normalizeText(causaleValue) || 'compila la causale CU' },
    { label: 'Importo compenso compilato', ok: (parseRitenutaDecimalInput(draft?.importoCompenso ?? importoCompensoValue) ?? 0) > 0, detail: formatMoney(draft?.importoCompenso ?? importoCompensoValue ?? 0) },
    { label: 'Base imponibile compilata', ok: (parseRitenutaDecimalInput(draft?.baseImponibile ?? baseImponibileValue) ?? 0) > 0, detail: formatMoney(draft?.baseImponibile ?? baseImponibileValue ?? 0) },
    { label: 'Base ritenuta coerente', ok: Math.abs(Number(draft?.baseRitenuta ?? baseImponibileValue ?? 0) - Number(draft?.baseImponibile ?? baseImponibileValue ?? 0)) < 0.01, detail: `Base ritenuta ${formatMoney(draft?.baseRitenuta ?? baseImponibileValue ?? 0)}` },
    { label: 'Aliquota presente', ok: Number(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0) > 0, detail: `${formatMoney(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0)}%` },
    { label: 'Ritenuta corretta', ok: Math.abs(Number(draft?.ritenuta ?? ritenutaValue ?? 0) - Math.round((Number(draft?.baseRitenuta ?? baseImponibileValue ?? 0) * Number(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0)) / 100 * 100) / 100) < 0.01, detail: formatMoney(draft?.ritenuta ?? ritenutaValue ?? 0) },
    { label: 'Codice somme non soggette', ok: !(Number(quotaNonSoggettaValue || 0) > 0 || Number(sommeNonSoggetteValue || 0) > 0) || Boolean(normalizeText(codiceQuotaValue || codiceSommeValue)), detail: normalizeText(codiceQuotaValue || codiceSommeValue) || 'obbligatorio se ci sono somme/quote non soggette' },
  ]

  const mainMessage = active
    ? `Parcella rilevata al lordo; ritenuta predisposta per pagamento/F24${draft?.dataScadenza ? ` con scadenza ${draft.dataScadenza}` : ''}.`
    : 'La causale corrente non prevede ritenute operative. Se cambi causale, la tab si predisporrà in modo automatico.'

  const renderQuickCreateModal = () => {
    if (!quickCreateOpen) return null
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 20, 30, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}
        onMouseDown={(e) => e.target === e.currentTarget && setQuickCreateOpen(false)}
      >
        <div 
          style={{
            background: 'linear-gradient(180deg, #132D46, #0C1F31)',
            border: '1px solid rgba(96,165,250,.2)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'grid',
            gap: '1.2rem',
            padding: '1.5rem',
            color: 'var(--tx)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f7c843' }}>Nuovo Percipiente (Inserimento Rapido)</h3>
            <button 
              type="button" 
              onClick={() => setQuickCreateOpen(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(188,204,226,.6)', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.4rem' }}>
            <button 
              type="button"
              onClick={() => setQuickForm(p => ({ ...p, tipo_persona: 'fisica' }))}
              style={{
                padding: '.35rem .85rem', borderRadius: '12px', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer',
                background: quickForm.tipo_persona === 'fisica' ? 'rgba(96,165,250,.2)' : 'rgba(255,255,255,.03)',
                color: quickForm.tipo_persona === 'fisica' ? '#f7c843' : 'rgba(188,204,226,.7)',
                border: '1px solid ' + (quickForm.tipo_persona === 'fisica' ? 'rgba(96,165,250,.3)' : 'rgba(255,255,255,.05)')
              }}
            >
              Persona fisica
            </button>
            <button 
              type="button"
              onClick={() => setQuickForm(p => ({ ...p, tipo_persona: 'giuridica' }))}
              style={{
                padding: '.35rem .85rem', borderRadius: '12px', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer',
                background: quickForm.tipo_persona === 'giuridica' ? 'rgba(96,165,250,.2)' : 'rgba(255,255,255,.03)',
                color: quickForm.tipo_persona === 'giuridica' ? '#f7c843' : 'rgba(188,204,226,.7)',
                border: '1px solid ' + (quickForm.tipo_persona === 'giuridica' ? 'rgba(96,165,250,.3)' : 'rgba(255,255,255,.05)')
              }}
            >
              Persona giuridica
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.8rem' }}>
            {quickForm.tipo_persona === 'giuridica' ? (
              <div style={{ gridColumn: 'span 2', display: 'grid', gap: '.25rem' }}>
                <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>RAGIONE SOCIALE *</label>
                <input 
                  value={quickForm.ragione_sociale} 
                  onChange={(e) => setQuickForm(p => ({ ...p, ragione_sociale: e.target.value }))}
                  style={REG_INPUT_STYLE}
                  placeholder="Es. Studio Tecnico SRL"
                />
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: '.25rem' }}>
                  <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>COGNOME *</label>
                  <input 
                    value={quickForm.cognome} 
                    onChange={(e) => setQuickForm(p => ({ ...p, cognome: e.target.value.toUpperCase() }))}
                    style={REG_INPUT_STYLE}
                    placeholder="ROSSI"
                  />
                </div>
                <div style={{ display: 'grid', gap: '.25rem' }}>
                  <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>NOME *</label>
                  <input 
                    value={quickForm.nome} 
                    onChange={(e) => setQuickForm(p => ({ ...p, nome: e.target.value.toUpperCase() }))}
                    style={REG_INPUT_STYLE}
                    placeholder="MARIO"
                  />
                </div>
              </>
            )}

            <div style={{ display: 'grid', gap: '.25rem' }}>
              <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>CODICE FISCALE *</label>
              <input 
                value={quickForm.codice_fiscale} 
                onChange={(e) => setQuickForm(p => ({ ...p, codice_fiscale: e.target.value.toUpperCase() }))}
                style={REG_INPUT_STYLE}
                maxLength={16}
                placeholder="RSSMRA80A01H501U"
              />
            </div>

            <div style={{ display: 'grid', gap: '.25rem' }}>
              <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>DATA DI NASCITA</label>
              <input 
                type="date"
                value={quickForm.data_nascita} 
                onChange={(e) => setQuickForm(p => ({ ...p, data_nascita: e.target.value }))}
                style={REG_INPUT_STYLE}
              />
            </div>

            <div style={{ display: 'grid', gap: '.25rem', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>RESIDENZA / INDIRIZZO</label>
              <input 
                value={quickForm.residenza_fiscale} 
                onChange={(e) => setQuickForm(p => ({ ...p, residenza_fiscale: e.target.value }))}
                style={REG_INPUT_STYLE}
                placeholder="Via Roma 12, Milano"
              />
            </div>

            <div style={{ display: 'grid', gap: '.25rem' }}>
              <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>CAUSALE CU *</label>
              <select
                value={quickForm.causale_prevalente}
                onChange={(e) => setQuickForm(p => ({ ...p, causale_prevalente: e.target.value }))}
                style={{ ...REG_INPUT_STYLE, padding: '.55rem .7rem' }}
              >
                <option value="A">A - Lavoro autonomo abituale</option>
                <option value="B">B - Diritti d'autore (da autore)</option>
                <option value="L">L - Diritti d'autore (non autore)</option>
                <option value="M">M - Lavoro autonomo occasionale</option>
                <option value="R">R - Provvigioni</option>
                <option value="V">V - Appalti condominio</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: '.25rem' }}>
              <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(188,204,226,.78)' }}>REGIME FISCALE *</label>
              <select
                value={quickForm.regime_fiscale}
                onChange={(e) => setQuickForm(p => ({ ...p, regime_fiscale: e.target.value }))}
                style={{ ...REG_INPUT_STYLE, padding: '.55rem .7rem' }}
              >
                <option value="ordinario">Ordinario</option>
                <option value="forfettario">Forfettario</option>
                <option value="semplificato">Semplificato</option>
              </select>
            </div>

            <div style={{ gridColumn: 'span 2', padding: '.45rem .6rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <input
                type="checkbox"
                id="quick-soggetto-cassa"
                checked={quickForm.soggetto_cassa_prev}
                onChange={(e) => setQuickForm(p => ({ ...p, soggetto_cassa_prev: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#f7c843' }}
              />
              <label htmlFor="quick-soggetto-cassa" style={{ fontSize: '.74rem', color: 'rgba(188,204,226,.88)', cursor: 'pointer', flex: 1 }}>
                Soggetto a cassa professionale
              </label>
              {quickForm.soggetto_cassa_prev && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.2rem' }}>
                  <input
                    type="number"
                    value={quickForm.cassa_previdenziale}
                    onChange={(e) => setQuickForm(p => ({ ...p, cassa_previdenziale: Number(e.target.value) }))}
                    style={{ ...REG_INPUT_STYLE, width: '50px', padding: '.25rem .45rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '.74rem', color: 'rgba(188,204,226,.6)' }}>%</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end', marginTop: '.4rem' }}>
            <button 
              type="button" 
              onClick={() => setQuickCreateOpen(false)}
              style={{
                padding: '.55rem 1.1rem', borderRadius: '12px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
                background: 'rgba(255,255,255,.04)', color: 'rgba(188,204,226,.8)', border: '1px solid rgba(255,255,255,.08)'
              }}
            >
              Annulla
            </button>
            <button 
              type="button" 
              onClick={handleSaveQuickCreate}
              style={{
                padding: '.55rem 1.1rem', borderRadius: '12px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(180deg, #E8922A, #d07e20)', color: '#fff', border: 'none',
                boxShadow: '0 4px 12px rgba(232, 146, 42, 0.2)'
              }}
            >
              Salva percipiente
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="erp-flat-panel" style={{ padding: '.8rem .9rem', height: '100%', display: 'grid', gap: '.55rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '.08rem' }}>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>Ritenute</div>
          <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.7)', lineHeight: 1.35 }}>{mainMessage}</div>
        </div>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="bdg bdg-green" style={{ fontSize: '.64rem', padding: '.2rem .45rem' }}>Predisposto</span>
          <span className="bdg" style={{ fontSize: '.64rem', padding: '.2rem .45rem', borderColor: 'rgba(96,165,250,.18)' }}>
            {isPagamento ? 'Pagamento' : isDocumento ? 'Documento' : 'Nessuno'}
          </span>
          <span className="bdg" style={{ fontSize: '.64rem', padding: '.2rem .45rem', borderColor: 'rgba(96,165,250,.18)' }}>
            {statusValue || 'predisposto'}
          </span>
        </div>
      </div>

      {active ? (
        <>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            {summaryRows.map((item) => (
              <SummaryChip key={item.label} label={item.label} value={formatMoney(item.value)} tone={item.tone} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '.7rem', alignItems: 'start' }}>
            <SectionCard title="Dati ritenuta / CU" subtitle="Percipiente, causale, compenso netto IVA, quote non soggette, base e ritenuta. Tutto editabile per ora.">
              <div style={{ display: 'grid', gap: '.58rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '.52rem' }}>
                  <Field label="Percipiente">
                    <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                      <input
                        list="ritenute-percipiente-list"
                        value={percipienteValue}
                        onChange={(event) => setPrefilledPercipiente(event?.target?.value ?? '')}
                        disabled={disabled}
                        placeholder="Studio Rossi"
                        style={{ ...REG_INPUT_STYLE, flex: 1, minWidth: '100px' }}
                        data-reg-focusable="true"
                        data-reg-key="ritenuteDraftPercipiente"
                        data-reg-mode={mode}
                      />
                      {percipienteValue && (
                        draft?.percipienteRecord ? (
                          <span style={{ fontSize: '.7rem', color: '#8be28e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '.15rem', whiteSpace: 'nowrap' }}>
                            🟢 Collegato
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                            <span style={{ fontSize: '.7rem', color: '#ff8f8f', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              🔴 Assente
                            </span>
                            <button
                              type="button"
                              onClick={handleOpenQuickCreate}
                              style={{
                                padding: '.25rem .5rem',
                                fontSize: '.68rem',
                                borderRadius: '8px',
                                background: 'linear-gradient(180deg, #E8922A, #d07e20)',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              + Aggiungi
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </Field>
                  <Field label="Codice fiscale">
                    <input
                      value={row.codiceFiscale ?? ritenutaData.codiceFiscale ?? ''}
                      onChange={setField('codiceFiscale')}
                      disabled={disabled}
                      placeholder="RSSMRA80A01F205X"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCodiceFiscale"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Causale reddituale / CU">
                    <input
                      list="ritenute-causale-list"
                      value={causaleValue}
                      onChange={(event) => setCausale(event?.target?.value ?? '')}
                      disabled={disabled}
                      placeholder="A - Lavoro autonomo abituale"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCausale"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Data pagamento">
                    <input
                      type="date"
                      value={row.dataPagamento ?? ritenutaData.dataPagamento ?? ''}
                      onChange={setField('dataPagamento')}
                      disabled={disabled}
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftPagamento"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Codice tributo">
                    <input
                      value={codiceTributoValue}
                      onChange={setField('codiceTributo')}
                      disabled={disabled}
                      placeholder="1040"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCodiceTributo"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Cassa previdenza %">
                    <input
                      value={aliquotaCassaValue || cassaValue}
                      onChange={setField('aliquotaCassa')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="4"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCassa"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Importo cassa">
                    <input
                      value={importoCassaValue}
                      onChange={setField('importoCassa')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftImportoCassa"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Importo compenso">
                    <input
                      value={importoCompensoValue}
                      onChange={setField('importoCompenso')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftImportoCompenso"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Quota non soggetta">
                    <input
                      value={quotaNonSoggettaValue}
                      onChange={setField('quotaNonSoggetta')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftQuotaNonSoggetta"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Somme non soggette">
                    <input
                      value={sommeNonSoggetteValue}
                      onChange={setField('sommeNonSoggette')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftSommeNonSoggette"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Codice quota non sogg.">
                    <input
                      value={codiceQuotaValue}
                      onChange={setField('codiceQuotaNonSoggetta')}
                      disabled={disabled}
                      placeholder="Q1"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCodiceQuotaNonSoggetta"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Codice somme non sogg.">
                    <input
                      value={codiceSommeValue}
                      onChange={setField('codiceSommeNonSoggette')}
                      disabled={disabled}
                      placeholder="E1"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCodiceSommeNonSoggette"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Base imponibile">
                    <input
                      value={baseImponibileValue}
                      onChange={setField('baseImponibile')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftBaseImponibile"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Base ritenuta">
                    <input
                      value={resolveRitenutaNumericInputValue(ritenutaData.manualBaseOverride ? ritenutaData.baseRitenuta : '', row.baseRitenuta ?? baseImponibileValue)}
                      onChange={setField('baseRitenuta')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftBaseRitenuta"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Aliquota ritenuta">
                    <input
                      value={aliquotaValue}
                      onChange={setField('aliquotaRitenuta')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder="20"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftAliquota"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Ritenuta calcolata">
                    <input
                      value={ritenutaValue}
                      onChange={setField('ritenuta')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder={formatMoney(0)}
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftRitenuta"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Netto">
                    <input
                      value={nettoValue}
                      onChange={setField('netto')}
                      inputMode="decimal"
                      disabled={disabled}
                      placeholder={formatMoney(0)}
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftNetto"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Codice cassa">
                    <input
                      value={codiceCassaValue}
                      onChange={setField('codiceCassa')}
                      disabled={disabled}
                      placeholder="EPAP"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCodiceCassa"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Stato">
                    <input
                      value={statusValue}
                      onChange={setField('stato')}
                      disabled={disabled}
                      placeholder="predisposto"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftStato"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <ToggleField
                      label="Escludi da CU / certificazione"
                      checked={Boolean(row.escludiDaCu ?? ritenutaData.escludiDaCu)}
                      onChange={(checked) => onChange?.('escludiDaCu', checked)}
                      disabled={disabled}
                      hint="Usalo solo quando il movimento non deve finire nel perimetro CU."
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Controlli e output" subtitle="Blocchi e riepilogo fiscale sintetico. Qui teniamo i controlli, non la compilazione principale.">
              <div style={{ display: 'grid', gap: '.55rem', alignContent: 'start' }}>
                <div style={{ display: 'grid', gap: '.4rem' }}>
                  {checks.map((check) => (
                    <CheckRow key={check.label} label={check.label} ok={check.ok} detail={check.detail} />
                  ))}
                </div>

                <ToneBox
                  tone={draftValidation.blockers?.length ? 'negative' : draftValidation.warnings?.length ? 'warning' : 'positive'}
                  title={draftValidation.blockers?.length ? 'Controlli da correggere' : draftValidation.warnings?.length ? 'Controlli da verificare' : 'Ritenuta pronta'}
                  body={
                    draftValidation.blockers?.length
                      ? draftValidation.blockers.join(' · ')
                      : draftValidation.warnings?.length
                        ? draftValidation.warnings.join(' · ')
                        : 'Tutti i dati essenziali risultano compilati e coerenti.'
                  }
                />

                <ToneBox
                  tone="neutral"
                  title="Riepilogo fiscale / previdenziale"
                  body={
                    `Base ${formatMoney(draft?.baseRitenuta ?? baseImponibileValue ?? 0)} · ` +
                    `Aliquota ${formatMoney(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0)}% · ` +
                    `Ritenuta ${formatMoney(draft?.ritenuta ?? ritenutaValue ?? 0)} · ` +
                    `Netto ${formatMoney(draft?.netto ?? nettoValue ?? 0)}`
                  }
                />

                {mode === 'pagamento' ? (
                  <ToneBox
                    tone="neutral"
                    title="Pagamento collegato"
                    body={`Partita ${draft?.partitarioDraft?.selectedPartitaNumeroDocumento || row.numeroDocumento || 'da collegare'} · importo ${formatMoney(row.importoPagamento ?? ritenutaData.importoPagamento ?? 0)}`}
                  />
                ) : null}

                {draftValidation.info?.length ? (
                  <div style={{ display: 'grid', gap: '.28rem', fontSize: '.64rem', color: 'rgba(188,204,226,.72)' }}>
                    {draftValidation.info.map((item) => (
                      <div key={item}>• {item}</div>
                    ))}
                  </div>
                ) : null}

                {draftValidation.warnings?.length ? (
                  <div style={{ display: 'grid', gap: '.3rem' }}>
                    {draftValidation.warnings.map((item) => (
                      <ToneBox key={item} tone="warning" title="Warning" body={item} />
                    ))}
                  </div>
                ) : null}

                {draftValidation.blockers?.length ? (
                  <div style={{ display: 'grid', gap: '.3rem' }}>
                    {draftValidation.blockers.map((item) => (
                      <ToneBox key={item} tone="negative" title="Blocco" body={item} />
                    ))}
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>
        </>
      ) : (
        <div style={{ padding: '.7rem .75rem', borderRadius: 14, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(96,165,250,.08)', color: 'rgba(188,204,226,.76)', fontSize: '.74rem', lineHeight: 1.45 }}>
          La causale corrente non prevede ritenute operative. Se cambi causale, la tab si predisporrà in modo automatico.
        </div>
      )}

      <datalist id="ritenute-percipiente-list">
        {percipienteOptions.map((item) => (
          <option key={toOptionId(item) || toOptionLabel(item)} value={toOptionLabel(item)} />
        ))}
      </datalist>
      <datalist id="ritenute-causale-list">
        {causaleOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      {renderQuickCreateModal()}
    </div>
  )
}
