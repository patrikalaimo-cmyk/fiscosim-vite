import { REG_CARD_STYLE, REG_INPUT_STYLE, REG_SECTION_TITLE_STYLE, formatMoney } from './registrazioneUi.js'

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
    const cassa = match.cassa_previdenziale ?? match.cassaPrevidenziale
    if (cassa != null && cassa !== '') onChange?.('cassaPrevidenziale', cassa)
  }
  const setCausale = (value) => {
    onChange?.('causaleCu', value)
    onChange?.('causaleReddituale', value)
  }

  const percipienteValue = row.percipienteNome ?? row.percipiente ?? ritenutaData.percipienteNome ?? ritenutaData.percipiente ?? ''
  const causaleValue = row.causaleCu ?? row.causaleReddituale ?? ritenutaData.causaleCu ?? ritenutaData.causaleReddituale ?? ''
  const importoCompensoValue = row.importoCompenso ?? ritenutaData.importoCompenso ?? row.imponibileReddito ?? row.imponibile ?? ''
  const quotaNonSoggettaValue = row.quotaNonSoggetta ?? ritenutaData.quotaNonSoggetta ?? ''
  const sommeNonSoggetteValue = row.sommeNonSoggette ?? ritenutaData.sommeNonSoggette ?? ''
  const codiceQuotaValue = row.codiceQuotaNonSoggetta ?? ritenutaData.codiceQuotaNonSoggetta ?? ''
  const codiceSommeValue = row.codiceSommeNonSoggette ?? ritenutaData.codiceSommeNonSoggette ?? ''
  const baseImponibileValue = row.baseImponibile ?? row.baseRitenuta ?? row.imponibileSoggettoRitenuta ?? ritenutaData.baseImponibile ?? ritenutaData.baseRitenuta ?? ritenutaData.imponibileSoggettoRitenuta ?? ''
  const aliquotaValue = row.aliquotaRitenuta ?? ritenutaData.aliquotaRitenuta ?? ''
  const ritenutaValue = row.ritenuta ?? ritenutaData.ritenuta ?? ''
  const nettoValue = row.netto ?? ritenutaData.netto ?? ''
  const cassaValue = row.cassaPrevidenziale ?? ritenutaData.cassaPrevidenziale ?? ''
  const codiceCassaValue = row.codiceCassa ?? ritenutaData.codiceCassa ?? ''
  const aliquotaCassaValue = row.aliquotaCassa ?? ritenutaData.aliquotaCassa ?? ''
  const importoCassaValue = row.importoCassa ?? ritenutaData.importoCassa ?? ''
  const codiceTributoValue = row.codiceTributo ?? ritenutaData.codiceTributo ?? '1040'
  const statusValue = row.stato || ritenutaData.stato || 'predisposto'
  const draftValidation = draft?.validation || {}

  const summaryRows = [
    { label: 'Compenso', value: draft?.importoCompenso ?? importoCompensoValue ?? 0, tone: 'positive' },
    { label: 'Base', value: draft?.baseRitenuta ?? baseImponibileValue ?? 0, tone: 'positive' },
    { label: 'Ritenuta', value: draft?.ritenuta ?? ritenutaValue ?? 0, tone: 'negative' },
    { label: 'Netto', value: draft?.netto ?? nettoValue ?? 0, tone: 'positive' },
  ]

  const checks = [
    { label: 'Percipiente collegato', ok: Boolean(draft?.percipienteRecord), detail: draft?.percipienteRecord?.ragione_sociale || percipienteValue || '' },
    { label: 'Codice fiscale presente', ok: Boolean(normalizeText(row.codiceFiscale || ritenutaData.codiceFiscale)), detail: normalizeText(row.codiceFiscale || ritenutaData.codiceFiscale) },
    { label: 'Causale reddituale valorizzata', ok: Boolean(normalizeText(causaleValue)), detail: normalizeText(causaleValue) || 'compila la causale CU' },
    { label: 'Importo compenso compilato', ok: Number(draft?.importoCompenso ?? importoCompensoValue ?? 0) > 0, detail: formatMoney(draft?.importoCompenso ?? importoCompensoValue ?? 0) },
    { label: 'Base imponibile compilata', ok: Number(draft?.baseImponibile ?? baseImponibileValue ?? 0) > 0, detail: formatMoney(draft?.baseImponibile ?? baseImponibileValue ?? 0) },
    { label: 'Base ritenuta coerente', ok: Math.abs(Number(draft?.baseRitenuta ?? baseImponibileValue ?? 0) - Number(draft?.baseImponibile ?? baseImponibileValue ?? 0)) < 0.01, detail: `Base ritenuta ${formatMoney(draft?.baseRitenuta ?? baseImponibileValue ?? 0)}` },
    { label: 'Aliquota presente', ok: Number(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0) > 0, detail: `${formatMoney(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0)}%` },
    { label: 'Ritenuta corretta', ok: Math.abs(Number(draft?.ritenuta ?? ritenutaValue ?? 0) - Math.round((Number(draft?.baseRitenuta ?? baseImponibileValue ?? 0) * Number(draft?.aliquotaRitenuta ?? aliquotaValue ?? 0)) / 100 * 100) / 100) < 0.01, detail: formatMoney(draft?.ritenuta ?? ritenutaValue ?? 0) },
    { label: 'Codice somme non soggette', ok: !(Number(quotaNonSoggettaValue || 0) > 0 || Number(sommeNonSoggetteValue || 0) > 0) || Boolean(normalizeText(codiceQuotaValue || codiceSommeValue)), detail: normalizeText(codiceQuotaValue || codiceSommeValue) || 'obbligatorio se ci sono somme/quote non soggette' },
  ]

  const mainMessage = active
    ? 'Ritenute predisposte. CU/770, scadenzario e F24 non sono generati in questa fase.'
    : 'La causale corrente non prevede ritenute operative. Se cambi causale, la tab si predisporrà in modo automatico.'

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
                    <input
                      list="ritenute-percipiente-list"
                      value={percipienteValue}
                      onChange={(event) => setPrefilledPercipiente(event?.target?.value ?? '')}
                      disabled={disabled}
                      placeholder="Studio Rossi"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftPercipiente"
                      data-reg-mode={mode}
                    />
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
                      placeholder="A - Lavoro autonomo"
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
                  <Field label="Cassa previdenza">
                    <input
                      value={cassaValue}
                      onChange={setField('cassaPrevidenziale')}
                      disabled={disabled}
                      placeholder="EPAP"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftCassa"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Importo compenso">
                    <input
                      value={row.importoCompenso ?? ritenutaData.importoCompenso ?? row.imponibileReddito ?? row.imponibile ?? ''}
                      onChange={setField('importoCompenso')}
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
                      value={row.baseRitenuta ?? ritenutaData.baseRitenuta ?? baseImponibileValue ?? ''}
                      onChange={setField('baseRitenuta')}
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
                  <Field label="Aliquota cassa">
                    <input
                      value={aliquotaCassaValue}
                      onChange={setField('aliquotaCassa')}
                      disabled={disabled}
                      placeholder="5"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftAliquotaCassa"
                      data-reg-mode={mode}
                    />
                  </Field>
                  <Field label="Importo cassa">
                    <input
                      value={importoCassaValue}
                      onChange={setField('importoCassa')}
                      disabled={disabled}
                      placeholder="0,00"
                      style={REG_INPUT_STYLE}
                      data-reg-focusable="true"
                      data-reg-key="ritenuteDraftImportoCassa"
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
    </div>
  )
}
