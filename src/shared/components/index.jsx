import { useState } from 'react'

// ─── TAG INPUT ───────────────────────────────────────────────────
export function TagInput({ value = [], onChange, placeholder = 'email@es.it' }) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setInput('')
  }

  const remove = t => onChange(value.filter(x => x !== t))

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', alignItems: 'center', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '.35rem .55rem', minHeight: 38 }}>
      {value.map(t => (
        <span key={t} style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 5, padding: '.15rem .45rem', fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          {t}
          <span onClick={() => remove(t)} style={{ cursor: 'pointer', color: 'var(--mu)', fontSize: '.8rem' }}>✕</span>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        style={{ border: 'none', background: 'transparent', color: 'var(--tx)', outline: 'none', fontSize: '.8rem', flex: 1, minWidth: 80 }}
      />
    </div>
  )
}

// ─── WIP BANNER ──────────────────────────────────────────────────
export function WIPBanner({ modulo = 'questo modulo' }) {
  return (
    <div className="page">
      <div className="alert alert-warn" style={{ marginBottom: '1rem' }}>
        🚧 <strong>{modulo}</strong> — In sviluppo
      </div>
    </div>
  )
}

// ─── ACCESS DENIED ───────────────────────────────────────────────
export function AccessDenied() {
  return (
    <div className="page">
      <div className="alert alert-err">🚫 Accesso non consentito</div>
    </div>
  )
}

// ─── SEND MAIL MODAL ─────────────────────────────────────────────
export function SendMailModal({ onClose, cliente = null, adempimento = null, oggetto = '', corpo = '' }) {
  const [to, setTo] = useState(cliente?.email ? [cliente.email] : [])
  const [cc, setCc] = useState(cliente?.email_cc || [])
  const [ogg, setOgg] = useState(oggetto)
  const [body, setBody] = useState(corpo)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (!to.length) return
    setSending(true)
    setErr(null)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, oggetto: ogg, corpo: body })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSent(true)
      setTimeout(onClose, 1500)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">📧 Invia Email</div>
          {cliente && <div className="modal-sub">{cliente.nome}</div>}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sent
            ? <div className="alert" style={{ background: 'rgba(52,194,122,.1)', border: '1px solid rgba(52,194,122,.3)', textAlign: 'center', fontWeight: 600, color: 'var(--gr)' }}>✅ Email inviata!</div>
            : (
              <>
                <div className="fg"><label>A</label><TagInput value={to} onChange={setTo} placeholder="destinatario@email.it" /></div>
                <div className="fg"><label>CC</label><TagInput value={cc} onChange={setCc} placeholder="cc@email.it" /></div>
                <div className="fg"><label>Oggetto</label><input value={ogg} onChange={e => setOgg(e.target.value)} /></div>
                <div className="fg"><label>Corpo</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ resize: 'vertical' }} /></div>
                {err && <div className="alert alert-err">⚠️ {err}</div>}
              </>
            )
          }
        </div>
        {!sent && (
          <div className="modal-foot">
            <button className="btn-sec" onClick={onClose}>Annulla</button>
            <button className="btn" disabled={!to.length || sending} onClick={send}>
              {sending ? '⏳ Invio...' : '📤 Invia'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
