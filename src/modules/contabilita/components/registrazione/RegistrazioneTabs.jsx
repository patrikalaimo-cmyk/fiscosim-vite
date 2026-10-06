function TabButton({ active, children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`erp-inline-tab${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 34,
        padding: '.38rem .72rem',
      }}
    >
      {children}
    </button>
  )
}

export function RegistrazioneTabs({ activeTab, tabs = [], onChange }) {
  return (
    <div className="erp-inline-tabs" style={{ marginBottom: '.6rem', padding: '.1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <TabButton key={tab.id} active={activeTab === tab.id} disabled={tab.disabled} onClick={() => onChange?.(tab.id)}>
            {tab.label}
          </TabButton>
        ))}
      </div>
    </div>
  )
}
