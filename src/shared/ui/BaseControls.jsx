export function BaseInput({ className = '', ...props }) {
  return <input className={`base-input${className ? ` ${className}` : ''}`} {...props} />
}

export function BaseSelect({ className = '', children, ...props }) {
  return (
    <select className={`base-select${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </select>
  )
}

export function BaseTable({ className = '', wrap = true, children, ...props }) {
  const table = (
    <table className={`tbl${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </table>
  )
  return wrap ? <div className="tbl-wrap">{table}</div> : table
}

export function BaseCheckbox({ className = '', label, ...props }) {
  return (
    <label className={`base-checkbox${className ? ` ${className}` : ''}`}>
      <input type="checkbox" className="base-checkbox-input" {...props} />
      {label != null && <span className="base-checkbox-label">{label}</span>}
    </label>
  )
}
