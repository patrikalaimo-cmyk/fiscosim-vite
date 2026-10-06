import React from 'react'

export function LiquidazioneIvaLifecyclePanel({ statoLiquidazione }) {
  const isAnteprima = statoLiquidazione === 'Anteprima'
  const isConsolidata = statoLiquidazione === 'Consolidata'
  const isDefinitiva = statoLiquidazione === 'Definitiva'

  const steps = [
    {
      index: 1,
      title: 'Anteprima liquidazione IVA',
      active: isAnteprima,
      checked: isConsolidata || isDefinitiva,
      bullets: [
        'Calcolo di lavoro basato sui registri IVA correnti...',
        'Nessuna LIPE collegata.',
        'Modifiche sempre consentite.'
      ],
      badge: isAnteprima ? 'ATTUALE' : null
    },
    {
      index: 2,
      title: 'Liquidazione consolidata',
      active: isConsolidata,
      checked: isDefinitiva,
      bullets: [
        'LIPE elaborata e salvata.',
        'Modifiche possibili ma con avvisi.',
        'Verificare eventuale ravvedimento LIPE.'
      ],
      badge: isConsolidata ? 'ATTUALE' : null
    },
    {
      index: 3,
      title: 'Liquidazione definitiva',
      active: isDefinitiva,
      checked: false,
      bullets: [
        'Registri IVA annuali stampati definitivamente.',
        'Modifiche vietate salvo sblocco.',
        'Richiesto sblocco da Owner / Admin.'
      ],
      badge: isDefinitiva ? 'ATTUALE' : null
    }
  ]

  return (
    <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--bd)' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
        Stato e ciclo di vita della liquidazione IVA
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', position: 'relative' }}>
        {steps.map((step, idx) => {
          let borderCol = 'var(--bd)'
          let bgCol = 'rgba(255, 255, 255, 0.02)'
          if (step.active) {
            borderCol = '#3498db'
            bgCol = 'rgba(52, 152, 219, 0.05)'
          } else if (step.checked) {
            borderCol = '#2ecc71'
            bgCol = 'rgba(46, 204, 113, 0.02)'
          }

          return (
            <div
              key={step.index}
              style={{
                border: `1px solid ${borderCol}`,
                borderRadius: '6px',
                padding: '1rem',
                background: bgCol,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: step.checked ? '#2ecc71' : step.active ? '#3498db' : 'var(--s3)',
                      color: step.checked || step.active ? '#fff' : 'var(--mu)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.75rem'
                    }}
                  >
                    {step.checked ? '✓' : step.index}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                    {step.title}
                  </span>
                  {step.badge && (
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: step.index === 1 ? 'rgba(52, 152, 219, 0.2)' : 'rgba(230, 126, 34, 0.2)',
                        color: step.index === 1 ? '#3498db' : '#e67e22',
                        marginLeft: 'auto'
                      }}
                    >
                      {step.badge}
                    </span>
                  )}
                </div>

                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.75rem', color: 'var(--mu)', lineHeigth: '1.4' }}>
                  {step.bullets.map((bullet, bIdx) => (
                    <li key={bIdx} style={{ marginBottom: '4px', listStyleType: step.checked ? 'checkmark' : 'initial' }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
