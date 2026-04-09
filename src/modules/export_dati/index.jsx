import { useEffect, useState } from 'react'
import { sb } from '../../lib/supabase'
import { ModuleHeader } from '../../shared/components'

export function ModuloExportDati({ onNavigate }) {
  const [societa, setSocieta] = useState([])
  const [selectedSocieta, setSelectedSocieta] = useState('')
  const [loading, setLoading] = useState(true)
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [periodo, setPeriodo] = useState('T1')

  useEffect(() => {
    sb.from('societa')
      .select('id,denominazione,partita_iva')
      .eq('attiva', true)
      .order('denominazione')
      .then(({ data }) => {
        setSocieta(data || [])
        setLoading(false)
      })
  }, [])

  const exportTypes = [
    { id: 'cu_tel', categoria: 'DICHIARAZIONI', nome: 'CU (Certificazioni Uniche)', descrizione: 'File .TEL per invio telematico Entratel', formato: '.TEL', icon: 'File', color: '#fb923c' },
    { id: 'lipe_xml', categoria: 'DICHIARAZIONI', nome: 'LIPE (Liquidazioni Periodiche IVA)', descrizione: 'File XML per comunicazione trimestrale IVA', formato: '.XML', icon: 'IVA', color: '#4ecdc4' },
    { id: 'iva_annuale', categoria: 'DICHIARAZIONI', nome: 'IVA Annuale', descrizione: 'Riepilogo annuale IVA per dichiarazione', formato: '.TXT', icon: 'Riepilogo', color: '#a78bfa' },
    { id: 'mod770', categoria: 'DICHIARAZIONI', nome: 'Modello 770', descrizione: "Riepilogo ritenute per dichiarazione sostituti d'imposta", formato: '.TXT', icon: '770', color: '#f472b6' },
    { id: 'intrastat', categoria: 'DICHIARAZIONI', nome: 'Intrastat', descrizione: 'Elenchi cessioni/acquisti intracomunitari', formato: '.TXT', icon: 'INT', color: '#60a5fa' },
    { id: 'f24_excel', categoria: 'PAGAMENTI', nome: 'F24 - Excel', descrizione: 'Esportazione F24 in formato Excel', formato: '.XLSX', icon: 'F24', color: '#34d399' },
    { id: 'f24_pdf', categoria: 'PAGAMENTI', nome: 'F24 - PDF', descrizione: 'Stampa F24 in formato PDF', formato: '.PDF', icon: 'F24', color: '#34d399' },
    { id: 'stampe_registri', categoria: 'STAMPE', nome: 'Registri IVA', descrizione: 'Registro acquisti, vendite, corrispettivi', formato: '.HTML/.PDF', icon: 'Registri', color: '#fbbf24' },
    { id: 'stampe_giornale', categoria: 'STAMPE', nome: 'Libro Giornale', descrizione: 'Stampa del libro giornale contabile', formato: '.HTML/.PDF', icon: 'Giornale', color: '#fbbf24' },
    { id: 'stampe_mastrini', categoria: 'STAMPE', nome: 'Mastrini', descrizione: 'Schede di mastro per singolo conto', formato: '.HTML/.PDF', icon: 'Mastrini', color: '#fbbf24' },
  ]

  const categorie = ['DICHIARAZIONI', 'PAGAMENTI', 'STAMPE']

  const navigaModulo = (exportId) => {
    const mapping = {
      cu_tel: { tab: 'cu', sub: null },
      lipe_xml: { tab: 'contabilita', sub: 'lipe' },
      iva_annuale: { tab: 'contabilita', sub: 'iva_annuale' },
      mod770: { tab: 'contabilita', sub: '770' },
      intrastat: { tab: 'contabilita', sub: 'intrastat' },
      f24_excel: { tab: 'f24', sub: null },
      f24_pdf: { tab: 'f24', sub: null },
      stampe_registri: { tab: 'contabilita', sub: 'stampe' },
      stampe_giornale: { tab: 'contabilita', sub: 'stampe' },
      stampe_mastrini: { tab: 'contabilita', sub: 'stampe' },
    }

    const dest = mapping[exportId]
    if (dest && onNavigate) {
      if (dest.sub) localStorage.setItem('contabilita_sub_tab', dest.sub)
      onNavigate(dest.tab)
    }
  }

  if (loading) return <div className="loading">Caricamento...</div>

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Export"
        title="Export dati"
        context="Hub centralizzato per l'esportazione di file telematici e stampe"
      />

      <div className="card" style={{ marginBottom: '1rem', background: 'linear-gradient(135deg,rgba(200,164,94,.08),rgba(200,164,94,.02))' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="fg" style={{ flex: '1 1 200px', minWidth: 150 }}>
            <label style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.25rem', display: 'block' }}>Società</label>
            <select value={selectedSocieta} onChange={(e) => setSelectedSocieta(e.target.value)} style={{ width: '100%', padding: '.5rem', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: '.82rem' }}>
              <option value="">— Tutte le società —</option>
              {societa.map((s) => <option key={s.id} value={s.id}>{s.denominazione} ({s.partita_iva})</option>)}
            </select>
          </div>
          <div className="fg" style={{ flex: '0 0 100px' }}>
            <label style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.25rem', display: 'block' }}>Anno</label>
            <select value={anno} onChange={(e) => setAnno(parseInt(e.target.value))} style={{ width: '100%', padding: '.5rem', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: '.82rem' }}>
              {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="fg" style={{ flex: '0 0 100px' }}>
            <label style={{ fontSize: '.72rem', color: 'var(--mu)', marginBottom: '.25rem', display: 'block' }}>Periodo</label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: '100%', padding: '.5rem', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--tx)', fontSize: '.82rem' }}>
              <option value="T1">1° Trimestre</option>
              <option value="T2">2° Trimestre</option>
              <option value="T3">3° Trimestre</option>
              <option value="T4">4° Trimestre</option>
              <option value="ANNO">Anno intero</option>
            </select>
          </div>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
        <strong>Navigazione automatica:</strong> Clicca su una card per andare direttamente al modulo e generare il file desiderato.
      </div>

      {categorie.map((cat) => (
        <div key={cat} style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.75rem', letterSpacing: '.5px' }}>{cat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
            {exportTypes.filter((e) => e.categoria === cat).map((exp) => (
              <div
                key={exp.id}
                className="card"
                style={{
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all .2s',
                  border: '1px solid var(--bd)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={() => navigaModulo(exp.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = exp.color
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--bd)'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `linear-gradient(135deg,${exp.color}22,transparent)`, borderRadius: '0 0 0 60px' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                  <div style={{ fontSize: '.8rem', minWidth: 56, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: `${exp.color}15`, fontWeight: 700 }}>
                    {exp.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: '.25rem' }}>{exp.nome}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--mu)', lineHeight: 1.4, marginBottom: '.5rem' }}>{exp.descrizione}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <span className="bdg" style={{ background: `${exp.color}20`, color: exp.color, border: `1px solid ${exp.color}40`, fontSize: '.65rem', padding: '.15rem .4rem' }}>
                        {exp.formato}
                      </span>
                      <span style={{ fontSize: '.68rem', color: 'var(--gold)' }}>Clicca per aprire →</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card" style={{ background: 'rgba(107,122,153,.08)', marginTop: '1rem' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
          <strong>Note:</strong> Ogni tipo di export è gestito dal modulo specializzato corrispondente.
          {' '}I file generati rispettano i formati richiesti dall'Agenzia delle Entrate (XML, TEL) e sono pronti per l'invio telematico tramite Entratel/Fisconline.
        </div>
      </div>
    </div>
  )
}
