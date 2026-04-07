import { ImportRow } from './ImportRow.jsx'

export function ImportAnagraficaMatcher({ form, up, clienti }) {
  const isPassiva = form.tipo_documento === 'fattura_passiva'

  return (
    <div>
      <div
        style={{
          fontSize: '.7rem',
          fontWeight: 700,
          color: 'var(--mu)',
          marginBottom: '.5rem',
          letterSpacing: '.06em',
        }}
      >
        DATI DOCUMENTO
      </div>
      <ImportRow label="N° Fattura" value={form.numero} onChange={(v) => up('numero', v)} />
      <ImportRow label="Data" value={form.data} onChange={(v) => up('data', v)} type="date" />
      <ImportRow label="Tipo doc" value={form.tipo_doc || 'TD01'} onChange={(v) => up('tipo_doc', v)} />

      <div
        style={{
          marginTop: '.75rem',
          fontSize: '.7rem',
          fontWeight: 700,
          color: 'var(--mu)',
          marginBottom: '.5rem',
          letterSpacing: '.06em',
        }}
      >
        {isPassiva ? 'FORNITORE (CEDENTE)' : 'CLIENTE (CESSIONARIO)'}
      </div>
      <ImportRow
        label="Denominazione"
        value={isPassiva ? form.cedente_denom : form.cessionario_denom}
        onChange={(v) => up(isPassiva ? 'cedente_denom' : 'cessionario_denom', v)}
      />
      <ImportRow
        label="P.IVA"
        value={isPassiva ? form.cedente_piva : form.cessionario_piva}
        onChange={(v) => up(isPassiva ? 'cedente_piva' : 'cessionario_piva', v)}
      />

      <div style={{ marginTop: '.5rem' }}>
        <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginBottom: '.2rem' }}>Cliente FiscoSim</div>
        <select
          value={form.cliente_id || ''}
          onChange={(e) => up('cliente_id', e.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--s2)',
            border: '1px solid var(--bd)',
            color: 'var(--tx)',
            borderRadius: 6,
            padding: '.35rem .5rem',
            fontSize: '.78rem',
          }}
        >
          <option value="">— Non associato —</option>
          {clienti?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
