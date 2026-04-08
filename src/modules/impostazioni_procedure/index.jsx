import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../../lib/supabase'
import { IVA_ALIQUOTE_SUPPORTATE, isDefaultPerAliquotaFlag } from '../../../domain/resolveIva.js'
import { ModuleHeader } from '../../shared/components'

const TAB_ALIQUOTE = 'aliquote_iva'

function numAliq(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : NaN
}

function validateUniqueDefault(rows) {
  const seen = {}
  for (const r of rows) {
    if (!isDefaultPerAliquotaFlag(r?.is_default_per_aliquota)) continue
    const a = numAliq(r.aliquota)
    if (!IVA_ALIQUOTE_SUPPORTATE.includes(a)) continue
    if (seen[a]) return `Più di una causale predefinita per aliquota ${a}%: impossibile salvare.`
    seen[a] = true
  }
  return null
}

export function ModuloImpostazioniProcedure() {
  const [tab, setTab] = useState(TAB_ALIQUOTE)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroAliq, setFiltroAliq] = useState('') // '' | '0'|'4'|...
  const [editRow, setEditRow] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.from('causali_iva').select('*').eq('attivo', true).limit(5000)

      if (error) throw error
      setRows(data || [])
    } catch (e) {
      console.error('[ImpostazioniProcedure]', e)
      alert(e?.message || String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const avvisoVincolo = useMemo(() => validateUniqueDefault(rows), [rows])

  const sortedFiltered = useMemo(() => {
    let list = [...(rows || [])]
    list.sort((a, b) => {
      const da = numAliq(a.aliquota)
      const db = numAliq(b.aliquota)
      if (da !== db) return da - db
      return String(a.codice || '').localeCompare(String(b.codice || ''), 'it')
    })
    if (filtroAliq !== '') {
      const n = Number(filtroAliq)
      list = list.filter(r => numAliq(r.aliquota) === n)
    }
    return list
  }, [rows, filtroAliq])

  const toggleAutomazione = async (r, checked) => {
    setSaving(true)
    try {
      const { error } = await sb.from('causali_iva').update({ usa_per_automazione: checked }).eq('id', r.id)
      if (error) throw error
      await load()
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const setDefault = async (r) => {
    const aliq = numAliq(r.aliquota)
    if (!IVA_ALIQUOTE_SUPPORTATE.includes(aliq)) {
      alert('Solo aliquote 0, 4, 5, 10, 22 possono avere una predefinita.')
      return
    }
    const others = rows.filter(
      c => numAliq(c.aliquota) === aliq && c.id !== r.id && isDefaultPerAliquotaFlag(c.is_default_per_aliquota)
    )
    if (others.length) {
      const ok = window.confirm(
        'Aliquota già predisposta. Vuoi sostituire la causale IVA esistente?'
      )
      if (!ok) return
    }
    setSaving(true)
    try {
      if (others.length) {
        const { error: e1 } = await sb
          .from('causali_iva')
          .update({ is_default_per_aliquota: false })
          .in(
            'id',
            others.map(o => o.id)
          )
        if (e1) throw e1
      }
      const { error: e2 } = await sb
        .from('causali_iva')
        .update({ is_default_per_aliquota: true })
        .eq('id', r.id)
      if (e2) throw e2
      await load()
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (form) => {
    const aliq = numAliq(form.aliquota)
    if (!IVA_ALIQUOTE_SUPPORTATE.includes(aliq)) {
      alert('Aliquota non valida: scegli tra 0, 4, 5, 10, 22.')
      return
    }
    const nextRows = rows.map(x =>
      x.id === form.id
        ? {
            ...x,
            codice: form.codice,
            codice_interno: form.codice_interno,
            descrizione: form.descrizione,
            aliquota: aliq,
            usa_per_automazione: !!form.usa_per_automazione,
            is_default_per_aliquota: !!form.is_default_per_aliquota,
          }
        : x
    )
    if (form.is_default_per_aliquota) {
      for (const x of nextRows) {
        if (x.id !== form.id && numAliq(x.aliquota) === aliq && isDefaultPerAliquotaFlag(x.is_default_per_aliquota)) {
          x.is_default_per_aliquota = false
        }
      }
    }
    const err = validateUniqueDefault(nextRows)
    if (err) {
      alert(err)
      return
    }
    setSaving(true)
    try {
      if (form.is_default_per_aliquota) {
        const others = rows.filter(
          c => numAliq(c.aliquota) === aliq && c.id !== form.id && isDefaultPerAliquotaFlag(c.is_default_per_aliquota)
        )
        if (others.length) {
          const ok = window.confirm(
            'Aliquota già predisposta. Vuoi sostituire la causale IVA esistente?'
          )
          if (!ok) {
            setSaving(false)
            return
          }
          await sb
            .from('causali_iva')
            .update({ is_default_per_aliquota: false })
            .in(
              'id',
              others.map(o => o.id)
            )
        }
      }
      const { error } = await sb
        .from('causali_iva')
        .update({
          codice: form.codice,
          codice_interno: form.codice_interno,
          descrizione: form.descrizione,
          aliquota: aliq,
          usa_per_automazione: !!form.usa_per_automazione,
          is_default_per_aliquota: !!form.is_default_per_aliquota,
        })
        .eq('id', form.id)
      if (error) throw error
      setEditRow(null)
      await load()
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Impostazioni"
        title="Impostazioni Procedure"
        context="Fonte unica per la risoluzione IVA (default per aliquota)"
      />

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--bd)', paddingBottom: '.5rem' }}>
        <button
          type="button"
          className={tab === TAB_ALIQUOTE ? 'btn' : 'btn-sec'}
          onClick={() => setTab(TAB_ALIQUOTE)}
          style={{ fontSize: '.82rem' }}
        >
          Aliquote IVA
        </button>
      </div>

      {tab === TAB_ALIQUOTE && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {avvisoVincolo && (
            <div
              style={{
                padding: '.5rem 1rem',
                background: 'rgba(224,82,82,.12)',
                borderBottom: '1px solid var(--bd)',
                fontSize: '.78rem',
                color: '#e05252',
                fontWeight: 600,
              }}
            >
              {avvisoVincolo}
            </div>
          )}
          <div style={{ padding: '.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'center', borderBottom: '1px solid var(--bd)' }}>
            <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
              Filtro aliquota:{' '}
              <select
                value={filtroAliq}
                onChange={e => setFiltroAliq(e.target.value)}
                style={{ marginLeft: '.35rem', background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--tx)', borderRadius: 6, padding: '.25rem .5rem' }}
              >
                <option value="">Tutte</option>
                {IVA_ALIQUOTE_SUPPORTATE.map(a => (
                  <option key={a} value={String(a)}>
                    {a}%
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-sec" style={{ fontSize: '.72rem' }} onClick={load} disabled={loading || saving}>
              Aggiorna
            </button>
            {saving && <span style={{ fontSize: '.72rem', color: 'var(--mu)' }}>Salvataggio…</span>}
          </div>

          <div style={{ overflowX: 'auto', width: '100%', minHeight: 120 }}>
            <table className="tbl" style={{ width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Codice interno</th>
                  <th>Descrizione</th>
                  <th>Aliquota (%)</th>
                  <th>Usa per automazione</th>
                  <th>Predefinita</th>
                  <th style={{ width: 100 }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--mu)' }}>
                      Caricamento causali IVA…
                    </td>
                  </tr>
                ) : sortedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--mu)' }}>
                      Nessuna causale IVA attiva trovata. Inseriscile da{' '}
                      <strong>Contabilità → Impostazioni → Causali IVA</strong> oppure importa l’anagrafica.
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map(r => {
                    const a = numAliq(r.aliquota)
                    const supported = IVA_ALIQUOTE_SUPPORTATE.includes(a)
                    return (
                      <tr key={r.id}>
                        <td>
                          <code style={{ fontSize: '.78rem' }}>{r.codice || '—'}</code>
                        </td>
                        <td>
                          <code style={{ fontSize: '.78rem' }}>{r.codice_interno || '—'}</code>
                          {isDefaultPerAliquotaFlag(r.is_default_per_aliquota) && supported && (
                            <span className="bdg bdg-green" style={{ marginLeft: '.35rem', fontSize: '.58rem' }}>
                              DEFAULT
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '.8rem' }}>{r.descrizione || '—'}</td>
                        <td>
                          <span className="bdg bdg-blue">{r.aliquota ?? '—'}%</span>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.usa_per_automazione === true}
                            onChange={e => toggleAutomazione(r, e.target.checked)}
                            disabled={saving || loading}
                          />
                        </td>
                        <td>
                          {supported ? (
                            <input
                              type="radio"
                              name={`default-aliquota-${a}`}
                              checked={isDefaultPerAliquotaFlag(r.is_default_per_aliquota)}
                              onChange={() => setDefault(r)}
                              disabled={saving || loading}
                              title="Una sola predefinita per aliquota"
                            />
                          ) : (
                            <span style={{ fontSize: '.72rem', color: 'var(--mu)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-sec"
                            style={{ fontSize: '.72rem', padding: '.2rem .5rem' }}
                            onClick={() => setEditRow(r)}
                          >
                            Modifica
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '.75rem 1rem', fontSize: '.72rem', color: 'var(--mu)', borderTop: '1px solid var(--bd)' }}>
            Aliquote supportate: <strong>{IVA_ALIQUOTE_SUPPORTATE.join(', ')}</strong>. Per ciascuna deve esistere una sola causale con predefinita. Esegui lo script SQL in{' '}
            <code style={{ fontSize: '.68rem' }}>scripts/sql/causali_iva_is_default_per_aliquota.sql</code> se la colonna non è ancora presente.
          </div>
        </div>
      )}

      {editRow && (
        <ModalEditCausaleIva
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={saveEdit}
          saving={saving}
        />
      )}
    </div>
  )
}

function ModalEditCausaleIva({ row, onClose, onSave, saving }) {
  const aliq0 = numAliq(row.aliquota)
  const [form, setForm] = useState(() => ({
    id: row.id,
    codice: row.codice || '',
    codice_interno: row.codice_interno || '',
    descrizione: row.descrizione || '',
    aliquota: IVA_ALIQUOTE_SUPPORTATE.includes(aliq0) ? aliq0 : 22,
    usa_per_automazione: row.usa_per_automazione === true,
    is_default_per_aliquota: isDefaultPerAliquotaFlag(row.is_default_per_aliquota),
  }))
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = () => onSave({ ...form, id: row.id })

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-hdr">
          <div className="modal-title">Modifica causale IVA</div>
          <button className="modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid" style={{ display: 'grid', gap: '.65rem' }}>
            <div className="fg">
              <label>Codice</label>
              <input value={form.codice} onChange={e => up('codice', e.target.value)} placeholder="es. F22" />
            </div>
            <div className="fg">
              <label>Codice interno</label>
              <input value={form.codice_interno} onChange={e => up('codice_interno', e.target.value)} placeholder="es. IVA_22" />
            </div>
            <div className="fg">
              <label>Descrizione</label>
              <input value={form.descrizione} onChange={e => up('descrizione', e.target.value)} />
            </div>
            <div className="fg">
              <label>Aliquota (%)</label>
              <select value={String(form.aliquota)} onChange={e => up('aliquota', Number(e.target.value))}>
                {IVA_ALIQUOTE_SUPPORTATE.map(a => (
                  <option key={a} value={a}>
                    {a}%
                  </option>
                ))}
              </select>
            </div>
            <div className="fg" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <input
                type="checkbox"
                id="usa_auto"
                checked={form.usa_per_automazione}
                onChange={e => up('usa_per_automazione', e.target.checked)}
              />
              <label htmlFor="usa_auto" style={{ margin: 0 }}>
                Usa per automazione
              </label>
            </div>
            <div className="fg" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <input
                type="checkbox"
                id="is_def"
                checked={form.is_default_per_aliquota}
                onChange={e => up('is_default_per_aliquota', e.target.checked)}
              />
              <label htmlFor="is_def" style={{ margin: 0 }}>
                Predefinita per questa aliquota
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-sec" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="btn" disabled={saving} onClick={submit}>
            {saving ? '⏳' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}
