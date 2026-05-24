const cardShell = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '.4rem',
}

const blockStyle = {
  padding: '.4rem .55rem',
  borderRadius: 14,
  background: 'linear-gradient(180deg, rgba(11, 24, 41, 0.96) 0%, rgba(6, 15, 27, 0.98) 100%)',
  border: '1px solid rgba(127, 154, 182, 0.16)',
  boxShadow: '0 8px 18px rgba(4, 12, 22, 0.22)',
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '.5rem',
  padding: '.12rem 0',
  borderBottom: '1px solid rgba(108, 136, 166, 0.12)',
}

const collapsedPreviewMap = {
  'Import & Stato banca': ['Banca', 'Periodo', 'Differenza saldo', 'Stato saldo'],
  'Match / Proposte': ['Proposte forti', 'Senza match', 'Duplicati sospetti'],
  'Azioni contabili': ['PN pronte', 'IVA per cassa da sbloccare', 'F24 rilevati / da dettagliare'],
}

export default function RiconciliazioneSummaryCards({ data, collapsed = {}, onToggle }) {
  const sections = [
    { title: 'Import & Stato banca', items: data.importStatus, accent: '#9fd0ff', pill: 'Saldo OK' },
    { title: 'Match / Proposte', items: data.matchProps, accent: '#8ee7b6', pill: 'Match engine' },
    { title: 'Azioni contabili', items: data.accountingProps, accent: '#ffd38c', pill: 'Target contabili' },
  ]

  return (
    <div style={cardShell}>
      {sections.map((section) => (
        <div key={section.title} className="card" style={blockStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', color: '#f0f7ff', lineHeight: 1.05 }}>{section.title}</div>
              <div style={{ fontSize: '.58rem', color: 'rgba(214, 225, 238, 0.74)', marginTop: '.05rem' }}>
                {collapsedPreviewMap[section.title].join(' | ')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
              <span className="bdg" style={{ background: 'rgba(14, 32, 54, 0.96)', color: section.accent }}>
                {section.pill}
              </span>
              <button className="btn-sec" onClick={() => onToggle(section.title)} style={{ padding: '.18rem .4rem', minHeight: 24, fontSize: '.64rem' }}>
                {collapsed[section.title] ? 'v' : '^'}
              </button>
            </div>
          </div>
          {!collapsed[section.title] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.12rem', marginTop: '.45rem' }}>
              {section.items.map(([label, value], index) => (
                <div key={label} style={{ ...rowStyle, borderBottom: index === section.items.length - 1 ? 'none' : rowStyle.borderBottom }}>
                  <span style={{ fontSize: '.72rem', color: 'rgba(214, 225, 238, 0.78)' }}>{label}</span>
                  <strong style={{ fontSize: '.79rem', color: '#eef5ff', textAlign: 'right', lineHeight: 1.1 }}>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
