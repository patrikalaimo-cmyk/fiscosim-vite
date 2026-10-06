export function ImportContabilitaKpiBar({
  ActionButton,
  busy,
  fileInCoda,
  visibili,
  complete,
  incomplete,
  ultimoImport,
  onCronologiaImport,
}) {
  const items = [
    ['File in coda', fileInCoda],
    ['Visibili', visibili],
    ['Complete', complete],
    ['Incomplete', incomplete],
  ]

  return (
    <section
      style={{
        borderRadius: 16,
        padding: '.24rem .24rem',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '.34rem',
        alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(9,24,40,.98), rgba(8,20,34,.96))',
        border: '1px solid rgba(96,165,250,.14)',
        boxShadow: '0 16px 36px rgba(0,0,0,.16)',
        marginTop: '.16rem',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(90px, 118px))',
          gap: '.08rem',
          minWidth: 0,
          width: 'fit-content',
          justifyContent: 'start',
        }}
      >
        {items.map((item) => (
          <div
            key={item[0]}
            style={{
              display: 'grid',
              gap: '.05rem',
              padding: '.09rem .14rem',
              minWidth: 0,
              background: 'linear-gradient(180deg, rgba(16,42,68,.72), rgba(10,26,43,.9))',
              borderRadius: 12,
              border: '1px solid rgba(96,165,250,.12)',
            }}
          >
            <div style={{ fontSize: '.58rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>{item[0]}</div>
            <div style={{ fontSize: '1rem', lineHeight: 1, fontWeight: 900, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item[1]}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', justifyItems: 'end', gap: '.1rem' }}>
        <div style={{ display: 'flex', gap: '.12rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'grid', gap: '.02rem', padding: '.12rem .28rem', borderRadius: 12, border: '1px solid rgba(96,165,250,.14)', background: 'rgba(16,42,68,.72)' }}>
            <div style={{ fontSize: '.55rem', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Ultimo import</div>
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--tx)' }}>{ultimoImport}</div>
          </div>
          <ActionButton label="Cronologia import" onClick={onCronologiaImport} disabled={busy} kind="ghost" emphasis />
        </div>
      </div>
    </section>
  )
}
