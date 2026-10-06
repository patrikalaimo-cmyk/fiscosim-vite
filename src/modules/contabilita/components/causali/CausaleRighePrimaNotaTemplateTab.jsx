import { useMemo, useState } from 'react'
import { RegistrazioneAccountPickerModal } from '../registrazione/RegistrazioneAccountPickerModal.jsx'
import { RegistrazioneAccountSearchModal } from '../registrazione/RegistrazioneAccountSearchModal.jsx'
import {
  buildRegistrazioneContoSelection,
  findRegistrazioneContoExactMatch,
  resolveRegistrazioneContoLabel,
  resolveContoHierarchyView,
} from '../../application/registrazioneOperations/resolveRegistrazioneConti.js'
import {
  CAUSALE_RIGHE_TEMPLATE_FORMULE,
  CAUSALE_RIGHE_TEMPLATE_LATI,
  normalizeRegistrazioneCausaleRighePrimaNotaTemplate,
  normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow,
} from '../../domain/registrazione/normalizeRegistrazioneCausaleDetail.js'

function buildLabelFromRow(row) {
  const descrizione = String(row?.conto_descrizione || '').trim()
  const codice = String(row?.conto_codice || '').trim()
  if (descrizione && codice) return `${codice} - ${descrizione}`
  return descrizione || codice || ''
}

function stringifyFormula(value) {
  if (value === 'totale_documento') return 'Totale documento'
  if (value === 'imponibile') return 'Imponibile'
  if (value === 'iva_detraibile') return 'IVA detraibile'
  if (value === 'iva_indetraibile') return 'IVA indetraibile'
  if (value === 'netto') return 'Netto'
  if (value === 'residuo_sbilancio') return 'Residuo sbilancio'
  return 'Manuale'
}

function normalizeRows(value) {
  return normalizeRegistrazioneCausaleRighePrimaNotaTemplate(value)
}

export default function CausaleRighePrimaNotaTemplateTab({ form, setForm, pianoConti = [] }) {
  const rows = useMemo(() => normalizeRows(form.righe_prima_nota_template), [form.righe_prima_nota_template])
  const [pickerState, setPickerState] = useState({ open: false, rowIndex: 0 })
  const [searchState, setSearchState] = useState({ open: false, rowIndex: 0 })
  const [drafts, setDrafts] = useState({})

  const commitRows = (nextRows) => {
    setForm((prev) => ({
      ...prev,
      righe_prima_nota_template: nextRows.map((row, index) => normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow(row, index)),
    }))
  }

  const updateRow = (rowIndex, field, value) => {
    commitRows(rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row)))
  }

  const addRow = () => {
    const nextOrder = rows.reduce((max, row) => Math.max(max, Number(row.ordine) || 0), 0) + 1
    commitRows([
      ...rows,
      normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow(
        {
          ordine: nextOrder,
          ruolo: 'conto_manualizzato',
          lato: 'dare',
          formula_importo: 'manuale',
          obbligatoria: false,
          modificabile: true,
          attiva: true,
        },
        rows.length
      ),
    ])
  }

  const removeRow = (rowIndex) => {
    commitRows(rows.filter((_, index) => index !== rowIndex))
  }

  const commitContoSelection = (rowIndex, conto) => {
    const selected = buildRegistrazioneContoSelection(conto)
    commitRows(
      rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              conto_id: selected.id || '',
              conto_codice: selected.codice || '',
              conto_descrizione: selected.conto_descrizione || resolveRegistrazioneContoLabel(selected) || '',
              hierarchyType: selected.hierarchyType || '',
              isTemplateScope: selected.hierarchyType === 'conto',
            }
          : row
      )
    )
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[rowIndex]
      return next
    })
  }

  const resolveContoByDraft = (rowIndex, value) => {
    const conto = findRegistrazioneContoExactMatch(pianoConti, value)
    if (!conto) {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[rowIndex]
        return next
      })
      return
    }
    if (resolveContoHierarchyView(conto).hierarchyType === 'mastro') return
    commitContoSelection(rowIndex, conto)
  }

  const openPicker = (rowIndex) => {
    setPickerState({ open: true, rowIndex })
  }

  const openSearch = (rowIndex) => {
    setSearchState({ open: true, rowIndex })
  }

  const handleContoKeyDown = (rowIndex, event) => {
    if (event.key === 'F2') {
      event.preventDefault()
      event.stopPropagation()
      openPicker(rowIndex)
      return
    }

    if (event.key === 'F3') {
      event.preventDefault()
      event.stopPropagation()
      openSearch(rowIndex)
    }
  }

  const visibleRows = [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = (Number(a.row.ordine) || 0) - (Number(b.row.ordine) || 0)
      if (diff) return diff
      return a.index - b.index
    })

  const getRowLabel = (row) => {
    if (row.conto_id) return buildLabelFromRow(row)
    if (row.conto_codice && row.conto_descrizione) return `${row.conto_codice} - ${row.conto_descrizione}`
    if (row.conto_descrizione) return row.conto_descrizione
    return ''
  }

  return (
    <div style={{ display: 'grid', gap: '.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--gold)' }}>Righe prima nota template</div>
          <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>
            Configura una struttura di righe predefinite con conto reale, lato e formula importo.
          </div>
        </div>
        <button type="button" className="btn-sec" onClick={addRow}>+ Aggiungi riga</button>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <span className="bdg bdg-blue" style={{ fontSize: '.56rem' }}>F2 Piano conti rapido</span>
        <span className="bdg bdg-gold" style={{ fontSize: '.56rem' }}>F3 Cerca conto</span>
      </div>

      {visibleRows.length === 0 ? (
        <div className="alert alert-info" style={{ fontSize: '.78rem' }}>
          Nessuna riga template configurata. Aggiungi una riga per iniziare.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 8 }}>
          <table className="tbl" style={{ minWidth: 1220 }}>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Ordine</th>
                <th style={{ width: 240 }}>Conto</th>
                <th>Descrizione conto</th>
                <th style={{ width: 110 }}>Dare/Avere</th>
                <th style={{ width: 170 }}>Formula importo</th>
                <th style={{ width: 90 }}>Obblig.</th>
                <th style={{ width: 90 }}>Modif.</th>
                <th style={{ width: 90 }}>Attiva</th>
                <th style={{ width: 90 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ row, index }) => {
                const displayValue = drafts[index] ?? getRowLabel(row)
                return (
                  <tr key={`${index}-${row.ordine}-${row.conto_codice || ''}`} style={{ opacity: row.attiva ? 1 : 0.6 }}>
                    <td>
                      <input
                        type="number"
                        value={row.ordine}
                        min={1}
                        onChange={(event) => updateRow(index, 'ordine', Number.parseInt(event.target.value, 10) || 0)}
                        style={{ width: 64 }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: '.3rem' }}>
                        <input
                          value={displayValue}
                          placeholder="Codice o descrizione conto"
                          onChange={(event) => {
                            const value = event.target.value
                            setDrafts((prev) => ({ ...prev, [index]: value }))
                            const exact = findRegistrazioneContoExactMatch(pianoConti, value)
                            const hierarchy = resolveContoHierarchyView(exact || {})
                            if (exact && hierarchy.hierarchyType !== 'mastro') {
                              commitContoSelection(index, exact)
                            } else if (!value.trim()) {
                              commitRows(
                                rows.map((row, currentIndex) =>
                                  currentIndex === index ? { ...row, conto_id: '', conto_codice: '', conto_descrizione: '' } : row
                                )
                              )
                            }
                          }}
                          onBlur={(event) => {
                            const value = String(event.target.value || '').trim()
                            if (!value) {
                              setDrafts((prev) => {
                                const next = { ...prev }
                                delete next[index]
                                return next
                              })
                              return
                            }
                            resolveContoByDraft(index, value)
                          }}
                          onKeyDown={(event) => {
                            handleContoKeyDown(index, event)
                            if (event.defaultPrevented) return
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              resolveContoByDraft(index, event.currentTarget.value)
                            }
                          }}
                          style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                          <button type="button" className="btn-sec" onClick={() => openPicker(index)} style={{ padding: '.2rem .45rem', fontSize: '.62rem' }}>
                            F2
                          </button>
                          <button type="button" className="btn-sec" onClick={() => openSearch(index)} style={{ padding: '.2rem .45rem', fontSize: '.62rem' }}>
                            F3
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: '.15rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '.78rem' }}>{row.conto_descrizione || 'Nessun conto'}</div>
                        <div style={{ fontSize: '.66rem', color: 'var(--mu)' }}>
                          {row.conto_codice ? row.conto_codice : 'Seleziona un conto dal piano dei conti'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <select value={row.lato} onChange={(event) => updateRow(index, 'lato', event.target.value)}>
                        {CAUSALE_RIGHE_TEMPLATE_LATI.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={row.formula_importo} onChange={(event) => updateRow(index, 'formula_importo', event.target.value)}>
                        {CAUSALE_RIGHE_TEMPLATE_FORMULE.map((option) => (
                          <option key={option} value={option}>{stringifyFormula(option)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className={row.obbligatoria ? 'btn' : 'btn-sec'} onClick={() => updateRow(index, 'obbligatoria', !row.obbligatoria)} style={{ padding: '.25rem .5rem', fontSize: '.68rem' }}>
                        {row.obbligatoria ? 'Sì' : 'No'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className={row.modificabile ? 'btn' : 'btn-sec'} onClick={() => updateRow(index, 'modificabile', !row.modificabile)} style={{ padding: '.25rem .5rem', fontSize: '.68rem' }}>
                        {row.modificabile ? 'Sì' : 'No'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className={row.attiva ? 'btn' : 'btn-sec'} onClick={() => updateRow(index, 'attiva', !row.attiva)} style={{ padding: '.25rem .5rem', fontSize: '.68rem' }}>
                        {row.attiva ? 'Sì' : 'No'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn-sec" onClick={() => removeRow(index)} style={{ padding: '.25rem .5rem', fontSize: '.68rem' }}>
                        Elimina
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <RegistrazioneAccountPickerModal
        open={pickerState.open}
        conti={pianoConti}
        activeContoId={rows[pickerState.rowIndex]?.conto_id || ''}
        selectionMode="template"
        onClose={() => setPickerState({ open: false, rowIndex: 0 })}
        onSelect={(conto) => {
          commitContoSelection(pickerState.rowIndex, conto)
          setPickerState({ open: false, rowIndex: 0 })
        }}
        title="Piano dei conti"
        subtitle="Selezione rapida per template causale"
      />

      <RegistrazioneAccountSearchModal
        open={searchState.open}
        conti={pianoConti}
        activeContoId={rows[searchState.rowIndex]?.conto_id || ''}
        selectionMode="template"
        onClose={() => setSearchState({ open: false, rowIndex: 0 })}
        onSelect={(conto) => {
          commitContoSelection(searchState.rowIndex, conto)
          setSearchState({ open: false, rowIndex: 0 })
        }}
        title="Ricerca conto"
        subtitle="Ricerca libera per template causale"
      />
    </div>
  )
}
