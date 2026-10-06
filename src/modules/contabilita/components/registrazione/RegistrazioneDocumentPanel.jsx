import { REG_CARD_STYLE, REG_INPUT_STYLE, REG_LABEL_STYLE, REG_SECTION_TITLE_STYLE } from './registrazioneUi.js'

function Field({ label, span = 3, children, hint = '', dataRegKey = '' }) {
  return (
    <div className="fg" style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <label style={REG_LABEL_STYLE}>{label}</label>
      <div data-reg-key={dataRegKey}>{children}</div>
      {hint ? <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.66)', marginTop: '.14rem' }}>{hint}</div> : null}
    </div>
  )
}

export function RegistrazioneDocumentPanel({ documentData, onChange, focusOrder = null, disabled = false }) {
  const setField = (field) => (event) => onChange?.(field, event?.target?.value ?? '')

  return (
    <div className="card" style={{ ...REG_CARD_STYLE, padding: '.8rem .9rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.6rem' }}>
        <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>Dati documento</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.42rem' }}>
        <Field label="Divisa" span={1} dataRegKey="documentCurrency">
          <select
            value={documentData.divisa || 'EUR'}
            onChange={setField('divisa')}
            disabled={disabled}
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentCurrency"
            data-reg-next={focusOrder?.nextByKey?.documentCurrency || 'documentRate'}
          >
            <option value="EUR">EUR - Euro</option>
            <option value="USD">USD - Dollaro</option>
            <option value="GBP">GBP - Sterlina</option>
          </select>
        </Field>
        <Field label="Cambio" span={1} dataRegKey="documentRate">
          <input
            value={documentData.cambio || ''}
            onChange={setField('cambio')}
            disabled={disabled}
            placeholder="1,000000"
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentRate"
            data-reg-next={focusOrder?.nextByKey?.documentRate || 'documentPaymentMode'}
          />
        </Field>
        <Field label="Modalità pagamento" span={1} dataRegKey="documentPaymentMode">
          <select
            value={documentData.modalitaPagamento || ''}
            onChange={setField('modalitaPagamento')}
            disabled={disabled}
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentPaymentMode"
            data-reg-next={focusOrder?.nextByKey?.documentPaymentMode || 'documentTaxable'}
          >
            <option value="">Seleziona</option>
            <option value="bonifico">Bonifico bancario</option>
            <option value="riba">Ri.Ba.</option>
            <option value="contanti">Contanti</option>
            <option value="assegno">Assegno</option>
          </select>
        </Field>
        <Field label="Totale imponibile" span={1} dataRegKey="documentTaxable">
          <input
            value={documentData.totaleImponibile || ''}
            onChange={setField('totaleImponibile')}
            disabled={disabled}
            placeholder="0,00"
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentTaxable"
            data-reg-next={focusOrder?.nextByKey?.documentTaxable || 'documentVat'}
          />
        </Field>
        <Field label="Totale imposte" span={1} dataRegKey="documentVat">
          <input
            value={documentData.totaleImposte || ''}
            onChange={setField('totaleImposte')}
            disabled={disabled}
            placeholder="0,00"
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentVat"
            data-reg-next={focusOrder?.nextByKey?.documentVat || 'documentTotal'}
          />
        </Field>
        <Field label="Totale documento" span={1} dataRegKey="documentTotal">
          <input
            value={documentData.totaleDocumento || ''}
            onChange={setField('totaleDocumento')}
            disabled={disabled}
            placeholder="0,00"
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="documentTotal"
            data-reg-next={focusOrder?.nextByKey?.documentTotal || 'rowsConto'}
          />
        </Field>
      </div>
    </div>
  )
}
