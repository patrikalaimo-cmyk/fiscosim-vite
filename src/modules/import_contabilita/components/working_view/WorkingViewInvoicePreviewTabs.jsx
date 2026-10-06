import { buildInvoicePreviewModel } from '../../application/buildInvoicePreviewModel.js'

export function WorkingViewInvoicePreviewTabs({
  activeWorkingViewModel,
  previewTab,
  setPreviewTab,
  ActionButton,
  MessageBox,
  formatMoney,
  getCounterpartyDisplayInfo,
  onPlaceholderAction,
}) {
  const parsed = activeWorkingViewModel.parsedDocument || {}
  const lineeDocumento = Array.isArray(parsed?.lineeDocumento) ? parsed.lineeDocumento : []
  const ivaRows = Array.isArray(parsed?.ivaRows) ? parsed.ivaRows : []
  const fornitoreDisplay = getCounterpartyDisplayInfo(parsed?.fornitore, 'fornitore')
  const clienteDisplay = getCounterpartyDisplayInfo(parsed?.cliente, 'cliente')
  const rawXml = String(parsed?.rawXml || '')
  const rawXmlMissing = !rawXml.trim()

  const previewModel = buildInvoicePreviewModel(parsed, {
    filename: activeWorkingViewModel.filename,
    sourceHash: activeWorkingViewModel.sourceHash,
    originType: activeWorkingViewModel.originType,
  })

  const originale = previewModel?.originale || {}
  const originalDoc = originale?.document || {}
  const originalParties = originale?.parties || {}
  const cedente = originalParties?.cedentePrestatore || {}
  const cessionario = originalParties?.cessionarioCommittente || {}
  const originalLines = Array.isArray(originale?.lines) ? originale.lines : []
  const originalVat = Array.isArray(originale?.vatSummary) ? originale.vatSummary : []
  const previewSupplier = fornitoreDisplay.title || parsed?.fornitore?.denominazione || '—'
  const previewCustomer = clienteDisplay.title || parsed?.cliente?.denominazione || '—'
  const lineItems = lineeDocumento.slice(0, 8).map((linea, index) => {
    const description = linea?.Descrizione || linea?.descrizione || `Linea ${index + 1}`
    const imponibile = linea?.PrezzoTotale ?? linea?.prezzoTotale ?? linea?.PrezzoUnitario ?? linea?.prezzoUnitario ?? linea?.importo ?? null
    const iva = linea?.AliquotaIVA ?? linea?.aliquotaIVA ?? linea?.aliquotaIva ?? linea?.aliquota ?? linea?.natura ?? '—'
    return {
      key: `${activeWorkingViewModel.rowKey}-linea-${index}`,
      description,
      imponibile,
      iva,
    }
  })
  const vatBreakdownItems = ivaRows.slice(0, 6).map((item, index) => {
    const aliquota = Number(item?.aliquota)
    const hasAliquota = Number.isFinite(aliquota)
    const rateLabel = hasAliquota
      ? `IVA ${String(Number(aliquota.toFixed(2))).replace('.', ',')}%`
      : item?.natura
        ? `Natura ${item.natura}`
        : `Riepilogo ${index + 1}`

    return {
      key: `${activeWorkingViewModel.rowKey}-vat-breakdown-${index}`,
      rateLabel,
      imponibile: Number(item?.imponibile ?? 0) || 0,
      imposta: Number(item?.imposta ?? item?.iva ?? 0) || 0,
    }
  })

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: '.18rem',
        border: '1px solid rgba(124,157,202,.16)',
        borderRadius: 16,
        padding: '.22rem',
        background: 'radial-gradient(circle at top left, rgba(35,72,112,.14), transparent 38%), rgba(255,255,255,.02)',
        alignSelf: 'stretch',
        width: '100%',
        minHeight: '100%',
      }}
    >
      <div style={{ display: 'grid', gap: '.04rem' }}>
        <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>
          Anteprima fattura
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.08rem', alignItems: 'center', padding: '.1rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.13)', background: 'rgba(6,22,35,.54)' }}>
        <ActionButton
          label="Fattura FiscoSim"
          onClick={() => setPreviewTab('fattura_fiscosim')}
          kind={previewTab === 'fattura_fiscosim' ? 'primary' : 'ghost'}
          small
        />
        <ActionButton
          label="Fattura originale"
          onClick={() => setPreviewTab('fattura_originale')}
          kind={previewTab === 'fattura_originale' ? 'primary' : 'ghost'}
          small
        />
        <ActionButton
          label="XML"
          onClick={() => setPreviewTab('xml')}
          kind={previewTab === 'xml' ? 'primary' : 'ghost'}
          small
        />
      </div>

      {previewTab === 'fattura_fiscosim' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.12rem', minHeight: '100%' }}>
          <div
            style={{
              display: 'grid',
              gap: '.16rem',
              border: '1px solid rgba(124,157,202,.14)',
              borderRadius: 14,
              padding: '.26rem .28rem',
              background: 'linear-gradient(180deg, rgba(17,39,61,.66), rgba(11,27,44,.6))',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.18rem', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: '.1rem' }}>
                <div style={{ fontSize: '.72rem', color: 'rgba(218,228,242,.86)', fontWeight: 700 }}>Anteprima fattura</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.18rem', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Tipo documento</span>
                <strong style={{ fontSize: '.9rem', color: '#e7f0ff' }}>{parsed?.tipoDocumento || '—'}</strong>
              </div>
              <div style={{ display: 'grid', gap: '.04rem', justifyItems: 'end' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Totale</span>
                <strong style={{ fontSize: '1.1rem', color: '#f6c74f' }}>{formatMoney(activeWorkingViewModel.totale)}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.22rem' }}>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Fornitore</span>
                <strong style={{ fontSize: '.86rem', color: '#edf4ff', lineHeight: 1.2 }}>{previewSupplier}</strong>
              </div>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Cliente / Cessionario</span>
                <strong style={{ fontSize: '.86rem', color: '#edf4ff', lineHeight: 1.2 }}>{previewCustomer}</strong>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(124,157,202,.14)' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.24rem' }}>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Numero</span>
                <strong style={{ fontSize: '.86rem', color: '#edf4ff' }}>{parsed?.numeroDocumento || '—'}</strong>
              </div>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Data</span>
                <strong style={{ fontSize: '.86rem', color: '#edf4ff' }}>{parsed?.dataDocumento || '—'}</strong>
              </div>
              <div style={{ display: 'grid', gap: '.04rem' }}>
                <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Divisa</span>
                <strong style={{ fontSize: '.86rem', color: '#edf4ff' }}>{parsed?.divisa || originalDoc?.divisa || 'EUR'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.1rem', flex: 1, minHeight: 0, border: '1px solid rgba(124,157,202,.13)', borderRadius: 14, background: 'linear-gradient(180deg, rgba(13,31,48,.58), rgba(10,26,41,.72))', overflow: 'hidden' }}>
            <div style={{ padding: '.18rem .22rem', fontSize: '.76rem', fontWeight: 700, color: '#edf4ff' }}>Righe documento</div>
            {lineItems.length ? (
              <div style={{ display: 'grid', alignContent: 'start', flex: 1, minHeight: 180 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 52%) 84px 48px', gap: '.08rem', padding: '.14rem .16rem', background: 'rgba(255,255,255,.035)', color: 'rgba(188,204,226,.8)', fontSize: '.58rem', fontWeight: 700 }}>
                  <span>Descrizione</span>
                  <span style={{ textAlign: 'right' }}>Imponibile</span>
                  <span style={{ textAlign: 'right' }}>IVA</span>
                </div>
                {lineItems.map((linea) => (
                  <div
                    key={linea.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 52%) 84px 48px',
                      gap: '.08rem',
                      padding: '.14rem .16rem',
                      borderTop: '1px solid rgba(124,157,202,.1)',
                      alignItems: 'start',
                    }}
                  >
                    <strong style={{ fontSize: '.68rem', color: '#edf4ff', lineHeight: 1.24, minWidth: 0 }}>{linea.description}</strong>
                    <span style={{ fontSize: '.68rem', color: '#edf4ff', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{linea.imponibile != null ? formatMoney(linea.imponibile) : '—'}</span>
                    <span style={{ fontSize: '.64rem', color: 'rgba(218,228,242,.88)', textAlign: 'right', whiteSpace: 'nowrap' }}>{String(linea.iva)}</span>
                  </div>
                ))}
                <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid rgba(124,157,202,.08)', background: 'linear-gradient(180deg, rgba(255,255,255,.012), rgba(255,255,255,0))' }} />
              </div>
            ) : (
              <MessageBox tone="neutral">Nessuna riga documento disponibile.</MessageBox>
            )}
          </div>

          {vatBreakdownItems.length ? (
            <div style={{ display: 'grid', gap: '.08rem' }}>
              <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.76)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
                Riepilogo IVA per aliquota
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.08rem' }}>
                {vatBreakdownItems.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      border: '1px solid rgba(124,157,202,.12)',
                      borderRadius: 12,
                      padding: '.14rem .16rem',
                      background: 'rgba(13,31,48,.46)',
                      display: 'grid',
                      gap: '.04rem',
                    }}
                  >
                    <div style={{ fontSize: '.62rem', color: 'rgba(188,204,226,.8)', fontWeight: 700 }}>{item.rateLabel}</div>
                    <div style={{ fontSize: '.82rem', color: '#edf4ff', fontWeight: 800 }}>{formatMoney(item.imposta)}</div>
                    <div style={{ fontSize: '.58rem', color: 'var(--mu)' }}>Imponibile {formatMoney(item.imponibile)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid rgba(124,157,202,.13)', borderRadius: 14, overflow: 'hidden', background: 'rgba(13,31,48,.54)', marginTop: 'auto' }}>
            <div style={{ padding: '.22rem .18rem', display: 'grid', gap: '.06rem', justifyItems: 'center' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.76)' }}>Imponibile</span>
              <strong style={{ fontSize: '1rem', color: '#edf4ff' }}>{formatMoney(activeWorkingViewModel.imponibile)}</strong>
            </div>
            <div style={{ padding: '.22rem .18rem', display: 'grid', gap: '.06rem', justifyItems: 'center', borderLeft: '1px solid rgba(124,157,202,.1)', borderRight: '1px solid rgba(124,157,202,.1)' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.76)' }}>IVA</span>
              <strong style={{ fontSize: '1rem', color: '#edf4ff' }}>{formatMoney(activeWorkingViewModel.iva)}</strong>
            </div>
            <div style={{ padding: '.22rem .18rem', display: 'grid', gap: '.06rem', justifyItems: 'center' }}>
              <span style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.76)' }}>Totale</span>
              <strong style={{ fontSize: '1rem', color: '#f6c74f' }}>{formatMoney(activeWorkingViewModel.totale)}</strong>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(124,157,202,.13)', borderRadius: 14, padding: '.18rem .22rem', background: 'rgba(13,31,48,.46)' }}>
            <button
              type="button"
              onClick={() => onPlaceholderAction('Apri file / XML completo')}
              style={{
                width: '100%',
                minHeight: 44,
                borderRadius: 10,
                border: '1px solid rgba(124,157,202,.14)',
                background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.018))',
                color: '#e8f1ff',
                fontSize: '.82rem',
                fontWeight: 700,
              }}
            >
              Apri file / XML completo
            </button>
          </div>
        </div>
      ) : null}

      {previewTab === 'fattura_originale' ? (
        <div style={{ display: 'grid', gap: '.14rem' }}>
          {originale.available ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gap: '.14rem',
                  border: '1px solid rgba(124,157,202,.15)',
                  borderRadius: 10,
                  padding: '.2rem .24rem',
                  background: 'rgba(10,27,44,.46)',
                }}
              >
                <div style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.7)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Intestazione documento (originale)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.12rem' }}>
                  <div style={{ display: 'grid', gap: '.02rem' }}>
                    <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Tipo</span>
                    <strong style={{ fontSize: '.75rem', color: '#e7f0ff' }}>{originalDoc?.tipoDocumento || '—'}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '.02rem' }}>
                    <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Numero</span>
                    <strong style={{ fontSize: '.75rem', color: '#e7f0ff' }}>{originalDoc?.numero || '—'}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '.02rem' }}>
                    <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Data</span>
                    <strong style={{ fontSize: '.75rem', color: '#e7f0ff' }}>{originalDoc?.data || '—'}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '.02rem' }}>
                    <span style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.72)' }}>Totale</span>
                    <strong style={{ fontSize: '.75rem', color: '#e7f0ff' }}>{formatMoney(originalDoc?.totale)}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '.12rem' }}>
                <div style={{ display: 'grid', gap: '.04rem', padding: '.2rem .24rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.13)', background: 'rgba(255,255,255,.018)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.68)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Cedente / Prestatore</div>
                  <strong style={{ fontSize: '.73rem' }}>{cedente?.denominazione || '—'}</strong>
                  <span style={{ fontSize: '.58rem', color: 'var(--mu)' }}>{cedente?.partitaIva || '—'} · {cedente?.codiceFiscale || '—'}</span>
                </div>
                <div style={{ display: 'grid', gap: '.04rem', padding: '.2rem .24rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.13)', background: 'rgba(255,255,255,.018)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.68)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Cessionario / Committente</div>
                  <strong style={{ fontSize: '.73rem' }}>{cessionario?.denominazione || '—'}</strong>
                  <span style={{ fontSize: '.58rem', color: 'var(--mu)' }}>{cessionario?.partitaIva || '—'} · {cessionario?.codiceFiscale || '—'}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '.1rem' }}>
                <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Righe documento</div>
                {originalLines.length ? (
                  <div style={{ display: 'grid', gap: '.08rem', maxHeight: 280, overflow: 'auto', paddingRight: '.06rem' }}>
                    {originalLines.slice(0, 8).map((linea, index) => (
                      <div
                        key={`linea-originale-${index}`}
                        style={{
                          padding: '.2rem .24rem',
                          borderRadius: 9,
                          border: '1px solid rgba(124,157,202,.12)',
                          background: 'rgba(8,27,42,.5)',
                          fontSize: '.62rem',
                          display: 'grid',
                          gap: '.04rem',
                        }}
                      >
                        <strong>{linea?.descrizione || `Linea ${index + 1}`}</strong>
                        <div style={{ color: 'var(--mu)' }}>
                          Q.tà {linea?.quantita ?? '—'} · Prezzo {formatMoney(linea?.prezzoTotale)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <MessageBox tone="neutral">Nessuna riga documento disponibile.</MessageBox>
                )}
              </div>

              <div style={{ display: 'grid', gap: '.1rem' }}>
                <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Riepilogo IVA (originale)</div>
                {originalVat.length ? (
                  <div style={{ display: 'grid', gap: '.08rem' }}>
                    {originalVat.slice(0, 6).map((item, index) => (
                      <div
                        key={`iva-originale-${index}`}
                        style={{
                          padding: '.2rem .24rem',
                          borderRadius: 9,
                          border: '1px solid rgba(124,157,202,.12)',
                          background: 'rgba(8,27,42,.5)',
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto',
                          gap: '.16rem',
                          fontSize: '.62rem',
                        }}
                      >
                        <span>Imponibile {formatMoney(item?.imponibile)}</span>
                        <span>IVA {formatMoney(item?.imposta)}</span>
                        <span style={{ color: 'var(--mu)' }}>{item?.natura || item?.aliquota || '—'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <MessageBox tone="neutral">Nessun riepilogo IVA disponibile.</MessageBox>
                )}
              </div>
            </>
          ) : (
            <MessageBox tone="neutral">
              {originale.reason || 'Dati fattura originale non disponibili.'}
            </MessageBox>
          )}
        </div>
      ) : null}

      {previewTab === 'xml' ? (
        <div style={{ display: 'grid', gap: '.14rem' }}>
          {!rawXmlMissing ? (
            <div
              style={{
                border: '1px solid rgba(124,157,202,.15)',
                borderRadius: 10,
                padding: '.3rem',
                background: 'rgba(10,27,44,.6)',
                fontFamily: 'monospace',
                fontSize: '.58rem',
                color: '#b8c9d6',
                maxHeight: 480,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.4,
              }}
            >
              {rawXml}
            </div>
          ) : (
            <MessageBox tone="neutral">XML originale non disponibile nello snapshot corrente.</MessageBox>
          )}
        </div>
      ) : null}
    </section>
  )
}
