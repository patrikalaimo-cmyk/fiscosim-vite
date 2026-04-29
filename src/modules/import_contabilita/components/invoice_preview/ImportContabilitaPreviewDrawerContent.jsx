import { buildInvoicePreviewModel } from '../../application/buildInvoicePreviewModel.js'

export function ImportContabilitaPreviewDrawerContent({
  previewRow,
  previewRowId,
  previewTab,
  setPreviewTab,
  manualAccountByRowId,
  manualCausaleByRowId,
  counterpartyAccountByRowId,
  getWorkingTableRowReadiness,
  getCounterpartyDisplayInfo,
  ViewToggle,
  MessageBox,
  BadgePlaceholder,
  MetaPill,
  formatMoney,
  formatManualAccount,
  formatManualCausale,
}) {
  const account = manualAccountByRowId[previewRowId] || null
  const causale = manualCausaleByRowId[previewRowId] || null
  const readiness = getWorkingTableRowReadiness(previewRow, account, causale, counterpartyAccountByRowId[previewRowId] || null)
  const warnings = Array.isArray(previewRow?.warnings) ? previewRow.warnings : []
  const blockingErrors = Array.isArray(previewRow?.blockingErrors) ? previewRow.blockingErrors : []
  const parsed = previewRow?.parsedDocument || {}
  const fornitoreDisplay = getCounterpartyDisplayInfo(parsed?.fornitore, 'fornitore')
  const clienteDisplay = getCounterpartyDisplayInfo(parsed?.cliente, 'cliente')
  const lineeDocumento = Array.isArray(parsed?.lineeDocumento) ? parsed.lineeDocumento : []
  const ivaRows = Array.isArray(parsed?.ivaRows) ? parsed.ivaRows : []
  const rawXml = String(parsed?.rawXml || '')
  const rawXmlMissing = !rawXml.trim()
  const previewModel = buildInvoicePreviewModel(parsed, {
    filename: previewRow?.filename,
    sourceHash: previewRow?.sourceHash,
    originType: previewRow?.originType,
    originFilename: previewRow?.originFilename,
    containerFilename: previewRow?.containerFilename,
  })
  const originale = previewModel?.originale || {}
  const originaleDocument = originale?.document || {}
  const originaleParties = originale?.parties || {}
  const originaleCedente = originaleParties?.cedentePrestatore || {}
  const originaleCessionario = originaleParties?.cessionarioCommittente || {}
  const originaleLines = Array.isArray(originale?.lines) ? originale.lines : []
  const originaleVatSummary = Array.isArray(originale?.vatSummary) ? originale.vatSummary : []
  const xmlModel = previewModel?.xml || {}
  const xmlRaw = String(xmlModel?.rawXml || rawXml || '')
  const xmlMissing = !xmlRaw.trim()
  const xmlFallbackReason = xmlModel?.reason || 'XML non disponibile nello snapshot compatto. Reimporta il file per rivedere il sorgente XML.'

  return (
    <div style={{ padding: '.44rem .5rem .56rem', display: 'grid', gap: '.4rem' }}>
      <div style={{ display: 'inline-flex', gap: '.24rem', padding: '.18rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)', width: 'fit-content' }}>
        <ViewToggle label="Fattura FiscoSim" active={previewTab === 'fattura'} onClick={() => setPreviewTab('fattura')} />
        <ViewToggle label="Fattura originale" active={previewTab === 'originale'} onClick={() => setPreviewTab('originale')} />
        <ViewToggle label="XML" active={previewTab === 'xml'} onClick={() => setPreviewTab('xml')} />
      </div>

      {previewTab === 'fattura' ? (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          <section style={{ position: 'sticky', top: 0, zIndex: 3, display: 'grid', gap: '.16rem', padding: '.26rem .3rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(12,16,24,.98)', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Testata</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '.22rem' }}>
              <MetaPill label="Tipo" value={parsed?.tipoDocumento || '—'} />
              <MetaPill label="Numero" value={parsed?.numeroDocumento || '—'} />
              <MetaPill label="Data" value={parsed?.dataDocumento || '—'} />
              <div style={{ padding: '.18rem .24rem', borderRadius: 10, border: '1px solid rgba(255,199,0,.32)', background: 'rgba(255,199,0,.12)' }}>
                <div style={{ fontSize: '.55rem', color: '#ffe38a', textTransform: 'uppercase', letterSpacing: '.05em' }}>Totale</div>
                <div style={{ fontSize: '.88rem', lineHeight: 1.08, fontWeight: 900, color: '#ffe38a' }}>{formatMoney(parsed?.totale)}</div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Cedente / Prestatore</div>
            <div style={{ display: 'grid', gap: '.12rem' }}>
              <div style={{ padding: '.24rem .28rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1.12 }}>{fornitoreDisplay.title}</div>
                <div style={{ fontSize: '.6rem', color: fornitoreDisplay.tone === 'danger' ? '#ffb3bd' : 'var(--mu)' }}>
                  {fornitoreDisplay.subtitle || `P.IVA: ${parsed?.fornitore?.partitaIva || '—'} · CF: ${parsed?.fornitore?.codiceFiscale || '—'}`}
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Dettaglio operazioni</div>
            {lineeDocumento.length ? (
              <div style={{ border: '1px solid rgba(124,157,202,.12)', borderRadius: 10, overflow: 'auto', background: 'rgba(255,255,255,.02)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                      <th style={{ textAlign: 'left', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Descrizione</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Quantità</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Prezzo unitario</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Totale</th>
                      <th style={{ textAlign: 'left', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>IVA / Natura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineeDocumento.map((linea, index) => (
                      <tr key={`${previewRowId}-linea-${index}`} style={{ borderTop: '1px solid rgba(124,157,202,.08)' }}>
                        <td style={{ padding: '.22rem .28rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{linea?.descrizione || '—'}</div>
                          <div style={{ fontSize: '.58rem', color: 'var(--mu)' }}>Linea {linea?.numeroLinea || index + 1}</div>
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {Number.isFinite(Number(linea?.quantita)) ? String(linea.quantita) : '—'}
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {formatMoney(linea?.prezzoUnitario)}
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {formatMoney(linea?.prezzoTotale)}
                        </td>
                        <td style={{ padding: '.22rem .28rem', verticalAlign: 'top' }}>
                          <div style={{ display: 'grid', gap: '.08rem' }}>
                            <span style={{ color: '#ffe38a' }}>{Number.isFinite(Number(linea?.aliquotaIVA)) ? `${formatMoney(linea.aliquotaIVA)}%` : '—'}</span>
                            <span style={{ color: 'var(--mu)' }}>{linea?.natura || '—'}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessuna riga documento disponibile</div>
            )}
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Cessionario / Committente</div>
            <div style={{ display: 'grid', gap: '.18rem' }}>
              <div style={{ padding: '.22rem .26rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1.12 }}>{clienteDisplay.title}</div>
                <div style={{ fontSize: '.66rem', color: clienteDisplay.tone === 'danger' ? '#ffb3bd' : 'var(--mu)' }}>
                  {clienteDisplay.subtitle || `P.IVA: ${parsed?.cliente?.partitaIva || '—'} · CF: ${parsed?.cliente?.codiceFiscale || '—'}`}
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Importi</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.22rem' }}>
              <div style={{ padding: '.26rem .3rem', borderRadius: 10, border: '1px solid rgba(255,199,0,.24)', background: 'rgba(255,199,0,.08)' }}>
                <div style={{ fontSize: '.54rem', color: '#ffe38a', textTransform: 'uppercase', letterSpacing: '.05em' }}>Imponibile</div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#ffe38a' }}>{formatMoney(parsed?.imponibile)}</div>
              </div>
              <div style={{ padding: '.26rem .3rem', borderRadius: 10, border: '1px solid rgba(255,199,0,.24)', background: 'rgba(255,199,0,.08)' }}>
                <div style={{ fontSize: '.54rem', color: '#ffe38a', textTransform: 'uppercase', letterSpacing: '.05em' }}>IVA</div>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#ffe38a' }}>{formatMoney(parsed?.iva)}</div>
              </div>
              <div style={{ padding: '.26rem .3rem', borderRadius: 10, border: '1px solid rgba(255,199,0,.34)', background: 'rgba(255,199,0,.12)' }}>
                <div style={{ fontSize: '.54rem', color: '#ffe38a', textTransform: 'uppercase', letterSpacing: '.05em' }}>Totale</div>
                <div style={{ fontSize: '.84rem', fontWeight: 900, color: '#ffe38a' }}>{formatMoney(parsed?.totale)}</div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Riepilogo IVA</div>
            {ivaRows.length ? (
              <div style={{ display: 'grid', gap: '.18rem' }}>
                {ivaRows.map((ivaRow, index) => (
                  <div key={`${previewRowId}-iva-${index}`} style={{ padding: '.24rem .28rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)', display: 'grid', gridTemplateColumns: '72px 1fr 72px 72px', gap: '.24rem', alignItems: 'center' }}>
                    <strong style={{ fontSize: '.7rem', color: '#ffe38a' }}>{ivaRow?.aliquota || '—'}</strong>
                    <span style={{ fontSize: '.62rem', color: 'var(--mu)' }}>{ivaRow?.natura || '—'}</span>
                    <span style={{ fontSize: '.66rem', textAlign: 'right', color: '#ffe38a' }}>{formatMoney(ivaRow?.imponibile)}</span>
                    <span style={{ fontSize: '.66rem', textAlign: 'right', color: '#ffe38a' }}>{formatMoney(ivaRow?.imposta)}</span>
                    <span style={{ gridColumn: '1 / -1', fontSize: '.6rem', color: 'var(--mu)' }}>
                      Esigibilità: {ivaRow?.esigibilita || ivaRow?.esigibilitaIVA || '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessuna riga IVA disponibile</div>
            )}
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Scelte operatore</div>
            <div style={{ display: 'grid', gap: '.16rem' }}>
              <MetaPill label="Conto" value={formatManualAccount(account)} />
              <MetaPill label="Causale" value={formatManualCausale(causale)} />
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Controlli</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.28rem' }}>
              <BadgePlaceholder text={readiness.label} />
              <div style={{ padding: '.16rem .28rem', borderRadius: 999, border: '1px solid rgba(255,199,0,.24)', background: 'rgba(255,199,0,.08)', color: '#ffe38a', fontSize: '.64rem', fontWeight: 700 }}>
                Warnings: {warnings.length}
              </div>
              <div style={{ padding: '.16rem .28rem', borderRadius: 999, border: '1px solid rgba(220,53,69,.22)', background: 'rgba(220,53,69,.08)', color: '#ffd8dd', fontSize: '.64rem', fontWeight: 700 }}>
                Blocking: {blockingErrors.length}
              </div>
            </div>
            {readiness.missing.length ? (
              <div style={{ display: 'grid', gap: '.14rem', fontSize: '.68rem', color: 'var(--mu)' }}>
                <div>Mancano: {readiness.missing.join(', ')}</div>
              </div>
            ) : null}
          </section>

          {warnings.length ? (
            <section style={{ display: 'grid', gap: '.22rem' }}>
              <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Warnings</div>
              <div style={{ display: 'grid', gap: '.16rem' }}>
                {warnings.map((warning, index) => (
                  <div key={`${previewRowId}-warning-${index}`} style={{ padding: '.22rem .26rem', borderRadius: 8, border: '1px solid rgba(255,199,0,.22)', background: 'rgba(255,199,0,.08)', color: '#ffe38a', fontSize: '.67rem' }}>
                    {typeof warning === 'string' ? warning : warning?.message || warning?.code || 'Warning'}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {blockingErrors.length ? (
            <section style={{ display: 'grid', gap: '.22rem' }}>
              <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Blocking errors</div>
              <div style={{ display: 'grid', gap: '.16rem' }}>
                {blockingErrors.map((blockingError, index) => (
                  <div key={`${previewRowId}-blocking-${index}`} style={{ padding: '.22rem .26rem', borderRadius: 8, border: '1px solid rgba(220,53,69,.22)', background: 'rgba(220,53,69,.08)', color: '#ffd8dd', fontSize: '.67rem' }}>
                    {typeof blockingError === 'string' ? blockingError : blockingError?.message || blockingError?.code || 'Blocking error'}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : previewTab === 'originale' ? (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          <section style={{ display: 'grid', gap: '.16rem', padding: '.26rem .3rem', borderRadius: 12, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(12,16,24,.98)' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Fattura originale</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.22rem' }}>
              <div style={{ padding: '.16rem .28rem', borderRadius: 999, border: '1px solid rgba(124,157,202,.22)', background: 'rgba(124,157,202,.08)', color: 'var(--tx)', fontSize: '.62rem', fontWeight: 700 }}>
                Stato preview: {originale?.available ? 'Disponibile' : 'Parziale'}
              </div>
              <div style={{ padding: '.16rem .28rem', borderRadius: 999, border: originale?.rawXmlAvailable ? '1px solid rgba(40,167,69,.22)' : '1px solid rgba(245,158,11,.28)', background: originale?.rawXmlAvailable ? 'rgba(40,167,69,.1)' : 'rgba(245,158,11,.12)', color: originale?.rawXmlAvailable ? '#baf3c5' : '#ffe38a', fontSize: '.62rem', fontWeight: 700 }}>
                XML originale: {originale?.rawXmlAvailable ? 'Disponibile' : 'Non disponibile'}
              </div>
            </div>
            {!originale?.rawXmlAvailable ? (
              <MessageBox tone="neutral">{originale?.reason || 'XML originale non disponibile nello snapshot corrente'}</MessageBox>
            ) : null}
          </section>

          <section style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Documento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '.22rem' }}>
              <MetaPill label="Tipo" value={originaleDocument?.tipoDocumento || '—'} />
              <MetaPill label="Numero" value={originaleDocument?.numero || '—'} />
              <MetaPill label="Data" value={originaleDocument?.data || '—'} />
              <div style={{ padding: '.18rem .24rem', borderRadius: 10, border: '1px solid rgba(255,199,0,.32)', background: 'rgba(255,199,0,.12)' }}>
                <div style={{ fontSize: '.55rem', color: '#ffe38a', textTransform: 'uppercase', letterSpacing: '.05em' }}>Totale</div>
                <div style={{ fontSize: '.88rem', lineHeight: 1.08, fontWeight: 900, color: '#ffe38a' }}>{formatMoney(originaleDocument?.totale)}</div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Cedente / Prestatore</div>
            <div style={{ padding: '.24rem .28rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1.12 }}>{originaleCedente?.denominazione || '—'}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--mu)' }}>
                {`P.IVA: ${originaleCedente?.partitaIva || '—'} · CF: ${originaleCedente?.codiceFiscale || '—'}`}
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Cessionario / Committente</div>
            <div style={{ padding: '.24rem .28rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1.12 }}>{originaleCessionario?.denominazione || '—'}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--mu)' }}>
                {`P.IVA: ${originaleCessionario?.partitaIva || '—'} · CF: ${originaleCessionario?.codiceFiscale || '—'}`}
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: '.14rem' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Dettaglio operazioni</div>
            {originaleLines.length ? (
              <div style={{ border: '1px solid rgba(124,157,202,.12)', borderRadius: 10, overflow: 'auto', background: 'rgba(255,255,255,.02)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                      <th style={{ textAlign: 'left', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Descrizione</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Quantità</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Prezzo unitario</th>
                      <th style={{ textAlign: 'right', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>Totale</th>
                      <th style={{ textAlign: 'left', padding: '.22rem .28rem', whiteSpace: 'nowrap' }}>IVA / Natura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {originaleLines.map((linea, index) => (
                      <tr key={`${previewRowId}-originale-linea-${index}`} style={{ borderTop: '1px solid rgba(124,157,202,.08)' }}>
                        <td style={{ padding: '.22rem .28rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{linea?.descrizione || '—'}</div>
                          <div style={{ fontSize: '.58rem', color: 'var(--mu)' }}>Linea {linea?.numeroLinea || index + 1}</div>
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {Number.isFinite(Number(linea?.quantita)) ? String(linea.quantita) : '—'}
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {formatMoney(linea?.prezzoUnitario)}
                        </td>
                        <td style={{ padding: '.22rem .28rem', textAlign: 'right', verticalAlign: 'top', color: '#ffe38a' }}>
                          {formatMoney(linea?.prezzoTotale)}
                        </td>
                        <td style={{ padding: '.22rem .28rem', verticalAlign: 'top' }}>
                          <div style={{ display: 'grid', gap: '.08rem' }}>
                            <span style={{ color: '#ffe38a' }}>{Number.isFinite(Number(linea?.aliquotaIVA)) ? `${formatMoney(linea.aliquotaIVA)}%` : '—'}</span>
                            <span style={{ color: 'var(--mu)' }}>{linea?.natura || '—'}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessuna riga documento disponibile</div>
            )}
          </section>

          <section style={{ display: 'grid', gap: '.22rem' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Riepilogo IVA</div>
            {originaleVatSummary.length ? (
              <div style={{ display: 'grid', gap: '.18rem' }}>
                {originaleVatSummary.map((ivaRow, index) => (
                  <div key={`${previewRowId}-originale-iva-${index}`} style={{ padding: '.24rem .28rem', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(255,255,255,.02)', display: 'grid', gridTemplateColumns: '72px 1fr 72px 72px', gap: '.24rem', alignItems: 'center' }}>
                    <strong style={{ fontSize: '.7rem', color: '#ffe38a' }}>{ivaRow?.aliquota || '—'}</strong>
                    <span style={{ fontSize: '.62rem', color: 'var(--mu)' }}>{ivaRow?.natura || '—'}</span>
                    <span style={{ fontSize: '.66rem', textAlign: 'right', color: '#ffe38a' }}>{formatMoney(ivaRow?.imponibile)}</span>
                    <span style={{ fontSize: '.66rem', textAlign: 'right', color: '#ffe38a' }}>{formatMoney(ivaRow?.imposta)}</span>
                    <span style={{ gridColumn: '1 / -1', fontSize: '.6rem', color: 'var(--mu)' }}>
                      Esigibilità: {ivaRow?.esigibilita || '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessuna riga IVA disponibile</div>
            )}
          </section>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.18rem' }}>
          {xmlMissing ? (
            <MessageBox tone="neutral">
              {xmlFallbackReason}
            </MessageBox>
          ) : null}
          <pre style={{
            margin: 0,
            padding: '.48rem .5rem',
            borderRadius: 10,
            border: '1px solid rgba(124,157,202,.12)',
            background: 'rgba(255,255,255,.02)',
            color: 'var(--tx)',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '.66rem',
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
            minHeight: '100%',
          }}>
            {xmlRaw || 'Nessun XML disponibile'}
          </pre>
        </div>
      )}
    </div>
  )
}
