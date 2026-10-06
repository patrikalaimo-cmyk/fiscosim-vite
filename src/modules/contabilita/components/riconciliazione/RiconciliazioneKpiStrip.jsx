const kpiShell = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: '.35rem',
}

const toneMap = {
  blue: { bg: 'rgba(37, 86, 128, 0.22)', border: 'rgba(98, 154, 214, 0.24)', value: '#9fd0ff' },
  amber: { bg: 'rgba(138, 99, 20, 0.18)', border: 'rgba(219, 170, 80, 0.25)', value: '#ffd38c' },
  green: { bg: 'rgba(31, 93, 63, 0.18)', border: 'rgba(88, 182, 132, 0.23)', value: '#8ee7b6' },
  red: { bg: 'rgba(128, 38, 54, 0.2)', border: 'rgba(231, 99, 121, 0.22)', value: '#ff9fb0' },
}

export default function RiconciliazioneKpiStrip({ kpis = [] }) {
  return (
    <div style={kpiShell}>
      {kpis.map((kpi) => {
        const tone = toneMap[kpi.tone] || toneMap.blue
        return (
          <div
            key={kpi.label}
            className="card"
            style={{
              padding: '.3rem .6rem',
              borderRadius: 14,
              borderColor: tone.border,
              background: `linear-gradient(180deg, ${tone.bg} 0%, rgba(7, 16, 31, 0.92) 100%)`,
            }}
          >
            <div style={{ fontSize: '.6rem', color: 'rgba(223, 236, 248, 0.76)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {kpi.label}
            </div>
            <div style={{ marginTop: '.06rem', fontSize: '1.06rem', fontWeight: 800, color: tone.value, lineHeight: 1.05 }}>
              {kpi.value}
            </div>
            <div style={{ marginTop: '.04rem', fontSize: '.58rem', color: 'rgba(210, 223, 237, 0.78)' }}>
              {kpi.secondary}
            </div>
          </div>
        )
      })}
    </div>
  )
}
