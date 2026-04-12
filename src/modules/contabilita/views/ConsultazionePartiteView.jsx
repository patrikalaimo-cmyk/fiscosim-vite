import { useEffect, useMemo, useState } from 'react'
import { ModuleHeader } from '../../../shared/components'
import { BaseCombobox } from '../../../shared/ui/BaseDropdown.jsx'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from '../ui/formatters.js'

function toIsoDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function startOfYear(year) {
  return `${String(year)}-01-01`
}

function endOfYear(year) {
  return `${String(year)}-12-31`
}

function parseAmount(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function num(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rowsToXml(rootName, rows, meta = {}) {
  const metaXml = Object.entries(meta)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join('')
  const items = rows
    .map((r) => {
      const attrs = [
        ['numero', r.numero_registrazione],
        ['data', r.data_registrazione],
        ['conto', `${r.conto_codice || ''}`.trim()],
        ['descrizione', r.conto_descrizione || ''],
        ['causale', r.causale_codice || ''],
        ['causaleIva', r.causale_iva_codice || ''],
        ['dare', r.dare],
        ['avere', r.avere],
        ['saldo', r.saldo_progressivo ?? r.saldo ?? 0],
        ['documento', r.numero_documento || ''],
      ]
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join('')
      return `<Riga${attrs}>${escapeXml(r.descrizione_riga || r.descrizione || '')}</Riga>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootName}>${metaXml}<Righe>${items}</Righe></${rootName}>`
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function printHtml(title, html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
}

function ChipList({ title, items, onRemove }) {
  if (!items.length) return null
  return (
    <div style={{ marginTop: '.45rem' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.25rem', letterSpacing: '.06em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="bdg bdg-gray"
            onClick={() => onRemove(item.id)}
            style={{ cursor: 'pointer', border: 'none', padding: '.28rem .5rem' }}
            title="Rimuovi filtro"
          >
            {item.label} ×
          </button>
        ))}
      </div>
    </div>
  )
}

function flattenPrimaNotaRows(rows) {
  return (rows || []).map((r) => {
    const pn = r?.prima_nota || {}
    const dare = num(r?.importo_dare ?? r?.dare)
    const avere = num(r?.importo_avere ?? r?.avere)
    return {
      id: r.id,
      prima_nota_id: pn.id || r.prima_nota_id || '',
      numero_registrazione: pn.numero_registrazione ?? '',
      data_registrazione: pn.data_registrazione || '',
      data_documento: pn.data_documento || '',
      numero_documento: pn.numero_documento || '',
      conto_id: r.conto_id || '',
      conto_codice: r.conto_codice || '',
      conto_descrizione: r.conto_descrizione || '',
      descrizione_riga: r.descrizione_riga || '',
      causale_codice: pn.causale_codice || '',
      causale_iva_codice: pn.causale_iva_codice || r.causale_iva_codice || '',
      controparte: pn.cliente_fornitore_nome || '',
      controparte_id: pn.cliente_fornitore_id || '',
      stato: pn.stato || '',
      dare,
      avere,
      saldo: dare - avere,
      tipo_riga_auto: r.tipo_riga_auto || '',
    }
  })
}

function flattenPartiteRows(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    conto_id: r.conto_id || '',
    conto_codice: r.conto_codice || '',
    conto_descrizione: r.conto_descrizione || '',
    tipo: r.tipo || '',
    numero_documento: r.numero_documento || '',
    data_documento: r.data_documento || '',
    data_scadenza: r.data_scadenza || '',
    importo_originale: num(r.importo_originale),
    importo_pagato: num(r.importo_pagato),
    importo_residuo: num(r.importo_residuo),
    stato: r.stato || '',
    prima_nota_id: r.prima_nota_id || '',
  }))
}

function rowsToPreviewHtml(title, subtitle, rows, saldoIniziale = 0) {
  const tableRows = rows
    .map(
      (r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeXml(r.data_registrazione || '')}</td>
          <td>${escapeXml(r.numero_registrazione || '')}</td>
          <td>${escapeXml(r.conto_codice || '')}</td>
          <td>${escapeXml(r.conto_descrizione || '')}</td>
          <td style="text-align:right">${fmt(r.dare)}</td>
          <td style="text-align:right">${fmt(r.avere)}</td>
          <td style="text-align:right">${fmt(r.saldo_progressivo ?? r.saldo ?? 0)}</td>
          <td>${escapeXml(r.causale_codice || '')}</td>
          <td>${escapeXml(r.causale_iva_codice || '')}</td>
          <td>${escapeXml(r.numero_documento || '')}</td>
        </tr>`
    )
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeXml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #111; }
  h1 { margin: 0 0 6px; font-size: 18px; }
  .sub { margin: 0 0 16px; color: #555; font-size: 12px; }
  .sum { margin: 8px 0 14px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #ccc; padding: 5px 6px; vertical-align: top; }
  th { background: #f4f4f4; text-align: left; }
  .num { text-align: right; }
</style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <div class="sub">${escapeXml(subtitle)}</div>
  <div class="sum">Saldo iniziale: ${fmt(saldoIniziale)} | Saldo finale: ${fmt(rows[rows.length - 1]?.saldo_progressivo ?? saldoIniziale)}</div>
  <table>
    <thead>
      <tr>
        <th>Prog.</th><th>Data</th><th>N. reg.</th><th>Conto</th><th>Descrizione</th><th class="num">Dare</th><th class="num">Avere</th><th class="num">Saldo</th><th>Causale</th><th>IVA</th><th>Doc.</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`
}

export function ConsultazionePartiteView({ societaAttiva, pianoConti, causaliContabili, causaliIva }) {
  const currentYear = new Date().getFullYear()
  const [periodMode, setPeriodMode] = useState('anno')
  const [anno, setAnno] = useState(String(currentYear))
  const [fromDate, setFromDate] = useState(startOfYear(currentYear))
  const [toDate, setToDate] = useState(todayIso())
  const [search, setSearch] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [contoFilters, setContoFilters] = useState([])
  const [causaleFilters, setCausaleFilters] = useState([])
  const [causaleIvaFilters, setCausaleIvaFilters] = useState([])
  const [contoPicker, setContoPicker] = useState('')
  const [causalePicker, setCausalePicker] = useState('')
  const [causaleIvaPicker, setCausaleIvaPicker] = useState('')
  const [partitarioStato, setPartitarioStato] = useState('aperta')
  const [primaNotaRows, setPrimaNotaRows] = useState([])
  const [partiteRows, setPartiteRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [openingRows, setOpeningRows] = useState([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [selectedContoId, setSelectedContoId] = useState('')
  const [error, setError] = useState('')

  const effectiveFrom = periodMode === 'anno' ? startOfYear(anno || currentYear) : fromDate || ''
  const effectiveTo = periodMode === 'anno' ? endOfYear(anno || currentYear) : toDate || ''

  useEffect(() => {
    if (!societaAttiva?.id) return
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([
      contabilitaRepo.getPrimaNotaConsultazioneRows(societaAttiva.id, {
        dateFrom: effectiveFrom,
        dateTo: effectiveTo,
      }),
      contabilitaRepo.getPartitarioBySocieta(societaAttiva.id, {
        stato: partitarioStato === 'tutti' ? null : partitarioStato,
      }),
    ])
      .then(([primaRes, partRes]) => {
        if (!alive) return
        if (primaRes?.error) throw primaRes.error
        if (partRes?.error) throw partRes.error
        setPrimaNotaRows(flattenPrimaNotaRows(primaRes?.data || []))
        setPartiteRows(flattenPartiteRows(partRes?.data || []))
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || String(e))
        setPrimaNotaRows([])
        setPartiteRows([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id, effectiveFrom, effectiveTo, partitarioStato])

  useEffect(() => {
    if (!societaAttiva?.id || !selectedContoId || !effectiveFrom) {
      setOpeningRows([])
      setOpeningBalance(0)
      return
    }
    let alive = true
    const prevDate = new Date(`${effectiveFrom}T00:00:00`)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevIso = prevDate.toISOString().slice(0, 10)
    contabilitaRepo
      .getPrimaNotaConsultazioneRows(societaAttiva.id, {
        dateTo: prevIso,
        contoIds: [selectedContoId],
      })
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        const rows = flattenPrimaNotaRows(data || [])
        setOpeningRows(rows)
        setOpeningBalance(rows.reduce((sum, r) => sum + r.saldo, 0))
      })
      .catch(() => {
        if (!alive) return
        setOpeningRows([])
        setOpeningBalance(0)
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id, selectedContoId, effectiveFrom])

  const optionsConti = useMemo(
    () => (pianoConti || [])
      .filter((c) => Number(c?.livello || 0) >= 3)
      .map((c) => ({
        id: c.id,
        label: `${c.codice ? `[${c.codice}] ` : ''}${c.descrizione || c.ragione_sociale || `${c.nome || ''} ${c.cognome || ''}`.trim()}`,
      })),
    [pianoConti]
  )

  const optionsCausali = useMemo(
    () => (causaliContabili || []).map((c) => ({ id: c.codice, label: `${c.codice} - ${c.descrizione}` })),
    [causaliContabili]
  )

  const optionsCausaliIva = useMemo(
    () => (causaliIva || []).map((c) => ({ id: c.codice, label: `${c.codice} - ${c.descrizione} (${c.aliquota}%)` })),
    [causaliIva]
  )

  const addUnique = (list, item) => {
    if (!item?.id) return list
    if (list.some((x) => String(x.id) === String(item.id))) return list
    return [...list, item]
  }

  const removeById = (list, id) => list.filter((x) => String(x.id) !== String(id))

  const filteredPrimaNota = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    const min = parseAmount(amountFrom)
    const max = parseAmount(amountTo)
    const contoSet = new Set(contoFilters.map((x) => String(x.id)))
    const causaleSet = new Set(causaleFilters.map((x) => String(x.id)))
    const causaleIvaSet = new Set(causaleIvaFilters.map((x) => String(x.id)))

    return primaNotaRows.filter((r) => {
      const docAmount = Math.max(Math.abs(r.dare || 0), Math.abs(r.avere || 0), Math.abs(r.saldo || 0))
      if (contoSet.size > 0 && !contoSet.has(String(r.conto_id))) return false
      if (causaleSet.size > 0 && !causaleSet.has(String(r.causale_codice))) return false
      if (causaleIvaSet.size > 0 && !causaleIvaSet.has(String(r.causale_iva_codice))) return false
      if (min != null && docAmount < min) return false
      if (max != null && docAmount > max) return false
      if (!q) return true
      const blob = [
        r.numero_registrazione,
        r.data_registrazione,
        r.numero_documento,
        r.conto_codice,
        r.conto_descrizione,
        r.descrizione_riga,
        r.causale_codice,
        r.causale_iva_codice,
        r.controparte,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [primaNotaRows, search, amountFrom, amountTo, contoFilters, causaleFilters, causaleIvaFilters])

  const schedaContoId = selectedContoId || contoFilters[0]?.id || ''
  const schedaConto = useMemo(() => (pianoConti || []).find((c) => String(c.id) === String(schedaContoId)) || null, [pianoConti, schedaContoId])

  const schedaRows = useMemo(() => {
    if (!schedaContoId) return []
    return primaNotaRows.filter((r) => String(r.conto_id) === String(schedaContoId))
  }, [primaNotaRows, schedaContoId])

  const schedaRowsWithOpening = useMemo(() => {
    let running = openingBalance
    return schedaRows.map((r) => {
      running += r.saldo
      return { ...r, saldo_progressivo: running }
    })
  }, [schedaRows, openingBalance])

  const partiteFiltered = useMemo(() => {
    if (!schedaContoId) return []
    return partiteRows.filter((r) => String(r.conto_id) === String(schedaContoId))
  }, [partiteRows, schedaContoId])

  const summary = useMemo(() => {
    const totalDare = filteredPrimaNota.reduce((sum, r) => sum + r.dare, 0)
    const totalAvere = filteredPrimaNota.reduce((sum, r) => sum + r.avere, 0)
    return {
      righe: filteredPrimaNota.length,
      dare: totalDare,
      avere: totalAvere,
      saldo: totalDare - totalAvere,
    }
  }, [filteredPrimaNota])

  const exportRows = schedaRowsWithOpening.length > 0
    ? schedaRowsWithOpening
    : filteredPrimaNota.map((r) => ({ ...r, saldo_progressivo: r.saldo }))

  const exportXml = () => {
    const xml = rowsToXml('ConsultazionePrimaNota', exportRows, {
      societa: societaAttiva?.denominazione || '',
      periodo_da: effectiveFrom,
      periodo_a: effectiveTo,
      conto: schedaConto?.descrizione || '',
    })
    const suffix = schedaConto?.codice ? `_${schedaConto.codice.replace(/\s+/g, '')}` : ''
    downloadText(`consultazione_partite${suffix}.xml`, xml, 'application/xml')
  }

  const exportPdf = () => {
    const rows = exportRows
    const html = rowsToPreviewHtml(
      `Consultazione e partite`,
      `${societaAttiva?.denominazione || ''} · ${effectiveFrom} - ${effectiveTo}${schedaConto ? ` · ${schedaConto.codice} ${schedaConto.descrizione}` : ''}`,
      rows,
      openingBalance
    )
    printHtml('Consultazione e partite', html)
  }

  if (!societaAttiva) return null

  return (
    <div className="erp-view">
      <ModuleHeader
        sectionLabel="Contabilità"
        title="Consultazione e partite"
        context="Ricerca prima nota, scheda conto e partitario con saldo progressivo"
        secondaryAction={
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button className="btn-sec" onClick={exportXml} disabled={!filteredPrimaNota.length || loading}>
              XML
            </button>
            <button className="btn-sec" onClick={exportPdf} disabled={!filteredPrimaNota.length || loading}>
              Stampa / PDF
            </button>
          </div>
        }
      />

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-hdr">
          <div>
            <div className="card-title">Filtri ricerca</div>
            <div className="card-subtitle">Puoi combinare anno, periodo, importo, conto, causale contabile e causale IVA.</div>
          </div>
        </div>

        <div className="toolbar" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="fg" style={{ minWidth: 150 }}>
            <label>Periodo</label>
            <BaseCombobox
              value={periodMode}
              onChange={(v) => setPeriodMode(v || 'anno')}
              options={[{ id: 'anno', label: 'Anno' }, { id: 'range', label: 'Range' }]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>

          {periodMode === 'anno' ? (
            <div className="fg" style={{ minWidth: 140 }}>
              <label>Anno</label>
              <BaseCombobox
                value={String(anno)}
                onChange={(v) => setAnno(v || String(currentYear))}
                options={[
                  String(currentYear),
                  String(currentYear - 1),
                  String(currentYear - 2),
                  String(currentYear - 3),
                ].map((y) => ({ id: y, label: y }))}
                getOptionId={(o) => o?.id}
                getOptionLabel={(o) => o?.label}
                searchable={false}
              />
            </div>
          ) : (
            <>
              <div className="fg" style={{ minWidth: 150 }}>
                <label>Da</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="fg" style={{ minWidth: 150 }}>
                <label>A</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="fg" style={{ flex: 1, minWidth: 240 }}>
            <label>Cerca</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Documento, descrizione, conto, controparte..." />
          </div>

          <div className="fg" style={{ minWidth: 120 }}>
            <label>Importo min</label>
            <input type="number" step="0.01" value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)} />
          </div>

          <div className="fg" style={{ minWidth: 120 }}>
            <label>Importo max</label>
            <input type="number" step="0.01" value={amountTo} onChange={(e) => setAmountTo(e.target.value)} />
          </div>

          <div className="fg" style={{ minWidth: 220 }}>
            <label>Conto</label>
            <BaseCombobox
              value={contoPicker}
              onChange={(v) => {
                const next = optionsConti.find((o) => String(o.id) === String(v)) || null
                if (next) setContoFilters((prev) => addUnique(prev, next))
                setContoPicker('')
              }}
              options={optionsConti}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable
              placeholder="Aggiungi conto..."
              maxItems={100}
            />
          </div>

          <div className="fg" style={{ minWidth: 220 }}>
            <label>Causale contabile</label>
            <BaseCombobox
              value={causalePicker}
              onChange={(v) => {
                const next = optionsCausali.find((o) => String(o.id) === String(v)) || null
                if (next) setCausaleFilters((prev) => addUnique(prev, next))
                setCausalePicker('')
              }}
              options={optionsCausali}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable
              placeholder="Aggiungi causale..."
              maxItems={100}
            />
          </div>

          <div className="fg" style={{ minWidth: 220 }}>
            <label>Causale IVA</label>
            <BaseCombobox
              value={causaleIvaPicker}
              onChange={(v) => {
                const next = optionsCausaliIva.find((o) => String(o.id) === String(v)) || null
                if (next) setCausaleIvaFilters((prev) => addUnique(prev, next))
                setCausaleIvaPicker('')
              }}
              options={optionsCausaliIva}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable
              placeholder="Aggiungi causale IVA..."
              maxItems={100}
            />
          </div>

          <div className="fg" style={{ minWidth: 180 }}>
            <label>Partite</label>
            <BaseCombobox
              value={partitarioStato}
              onChange={(v) => setPartitarioStato(v || 'aperta')}
              options={[
                { id: 'aperta', label: 'Aperte' },
                { id: 'parziale', label: 'Parziali' },
                { id: 'chiusa', label: 'Chiuse' },
                { id: 'tutti', label: 'Tutte' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>

          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{summary.righe}</strong> righe</span>
            <span className="cont-toolbar-pill"><strong>{fmt(summary.dare)}</strong> dare</span>
            <span className="cont-toolbar-pill"><strong>{fmt(summary.avere)}</strong> avere</span>
            <span className="cont-toolbar-pill"><strong>{fmt(summary.saldo)}</strong> saldo</span>
          </div>
        </div>

        <ChipList title="Conti selezionati" items={contoFilters} onRemove={(id) => setContoFilters((prev) => removeById(prev, id))} />
        <ChipList title="Causali contabili selezionate" items={causaleFilters} onRemove={(id) => setCausaleFilters((prev) => removeById(prev, id))} />
        <ChipList title="Causali IVA selezionate" items={causaleIvaFilters} onRemove={(id) => setCausaleIvaFilters((prev) => removeById(prev, id))} />
      </div>

      {error ? <div className="alert alert-warn">{error}</div> : null}

      {loading ? (
        <div className="empty"><div className="empty-t">Caricamento...</div></div>
      ) : filteredPrimaNota.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">📒</div>
          <div className="empty-t">Nessun movimento trovato</div>
          <div className="empty-s">Modifica i filtri per consultare altre scritture o partite.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
          <div className="card-hdr">
            <div>
              <div className="card-title">Ricerca prima nota</div>
              <div className="card-subtitle">Righe contabili filtrate con saldo progressivo sulla selezione corrente.</div>
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Prog.</th>
                  <th>Data</th>
                  <th>Riga</th>
                  <th>Conto</th>
                  <th>Descrizione</th>
                  <th className="tar">Dare</th>
                  <th className="tar">Avere</th>
                  <th className="tar">Saldo</th>
                  <th>Causale</th>
                  <th>IVA</th>
                  <th>Doc.</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrimaNota.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedContoId(r.conto_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700 }}>{r.numero_registrazione}</td>
                    <td style={{ fontSize: '.78rem' }}>{fmtDate(r.data_registrazione)}</td>
                    <td>{r.descrizione_riga || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{r.conto_codice || '—'}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{r.conto_descrizione || '—'}</div>
                    </td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.controparte || r.descrizione_riga || '—'}</td>
                    <td className="tar" style={{ fontWeight: 700 }}>{fmt(r.dare)}</td>
                    <td className="tar" style={{ fontWeight: 700 }}>{fmt(r.avere)}</td>
                    <td className="tar" style={{ fontWeight: 800, color: r.saldo >= 0 ? 'var(--gr)' : 'var(--rd)' }}>
                      {r.saldo >= 0 ? fmt(r.saldo) : `-${fmt(Math.abs(r.saldo))}`}
                    </td>
                    <td><span className="bdg bdg-blue">{r.causale_codice || '—'}</span></td>
                    <td>{r.causale_iva_codice || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.numero_documento || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {schedaContoId ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
          <div className="card-hdr">
            <div>
              <div className="card-title">Consultazione e partite</div>
              <div className="card-subtitle">
                {schedaConto ? `${schedaConto.codice} - ${schedaConto.descrizione}` : 'Conto selezionato'}
              </div>
            </div>
            <div className="cont-toolbar-summary">
              <span className="cont-toolbar-pill"><strong>{fmt(openingBalance)}</strong> saldo iniziale</span>
              <span className="cont-toolbar-pill"><strong>{fmt((schedaRowsWithOpening.at(-1)?.saldo_progressivo ?? openingBalance) - openingBalance)}</strong> movimento periodo</span>
              <span className="cont-toolbar-pill"><strong>{fmt(schedaRowsWithOpening.at(-1)?.saldo_progressivo ?? openingBalance)}</strong> saldo finale</span>
            </div>
          </div>

          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Prog.</th>
                  <th>Data</th>
                  <th>Doc.</th>
                  <th>Descrizione</th>
                  <th className="tar">Dare</th>
                  <th className="tar">Avere</th>
                  <th className="tar">Saldo</th>
                  <th>Contropartita</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={8} style={{ background: 'var(--s2)', fontWeight: 700 }}>
                    Saldo esercizio precedente: {fmt(openingBalance)}
                  </td>
                </tr>
                {openingRows.length > 0 && (
                  <tr>
                    <td colSpan={8} style={{ fontSize: '.72rem', color: 'var(--mu)' }}>
                      {openingRows.length} movimenti antecedenti al periodo selezionato.
                    </td>
                  </tr>
                )}
                {schedaRowsWithOpening.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.numero_registrazione}</td>
                    <td style={{ fontSize: '.78rem' }}>{fmtDate(r.data_registrazione)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.numero_documento || '—'}</td>
                    <td>{r.descrizione_riga || '—'}</td>
                    <td className="tar">{fmt(r.dare)}</td>
                    <td className="tar">{fmt(r.avere)}</td>
                    <td className="tar" style={{ fontWeight: 800, color: r.saldo_progressivo >= 0 ? 'var(--gr)' : 'var(--rd)' }}>
                      {r.saldo_progressivo >= 0 ? fmt(r.saldo_progressivo) : `-${fmt(Math.abs(r.saldo_progressivo))}`}
                    </td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.controparte || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {schedaContoId ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-hdr">
            <div>
              <div className="card-title">Partite</div>
              <div className="card-subtitle">Saldo residuo e stato delle partite aperte o chiuse per il conto selezionato.</div>
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Data</th>
                  <th>Scadenza</th>
                  <th className="tar">Orig.</th>
                  <th className="tar">Pagato</th>
                  <th className="tar">Residuo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {partiteFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem', color: 'var(--mu)' }}>
                      Nessuna partita disponibile per il conto selezionato.
                    </td>
                  </tr>
                ) : (
                  partiteFiltered.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace' }}>{p.numero_documento || '—'}</td>
                      <td style={{ fontSize: '.78rem' }}>{p.data_documento ? fmtDate(p.data_documento) : '—'}</td>
                      <td style={{ fontSize: '.78rem' }}>{p.data_scadenza ? fmtDate(p.data_scadenza) : '—'}</td>
                      <td className="tar" style={{ fontWeight: 700 }}>{fmt(p.importo_originale)}</td>
                      <td className="tar">{fmt(p.importo_pagato)}</td>
                      <td className="tar" style={{ fontWeight: 700, color: p.importo_residuo > 0 ? 'var(--gld2)' : 'var(--mu)' }}>{fmt(p.importo_residuo)}</td>
                      <td><span className="bdg bdg-gray">{p.stato}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
