import { useState, useEffect, createContext, useContext } from 'react'

// ─── AI STATUS CONTEXT ──────────────────────────────────────────
// Tracks AI usage globally: idle | processing | done
// Pattern duale AI ON/OFF: badge mostra stato in tempo reale
export const AIStatusContext = createContext({
  status: 'idle',   // idle | processing | done
  lastOp: null,     // last operation name
  method: null,     // 'ai' | 'local' | null
  setAI: (status, op, method) => {}
})

export function AIStatusProvider({ children }) {
  const [state, setState] = useState({ status: 'idle', lastOp: null, method: null, ts: null })

  const setAI = (status, op, method) =>
    setState({ status, lastOp: op || null, method: method || null, ts: Date.now() })

  // Auto-fade from 'done' to 'idle' after 8s
  useEffect(() => {
    if (state.status === 'done') {
      const t = setTimeout(
        () => setState(s => s.status === 'done' ? { ...s, status: 'idle' } : s),
        8000
      )
      return () => clearTimeout(t)
    }
  }, [state.status, state.ts])

  return (
    <AIStatusContext.Provider value={{ ...state, setAI }}>
      {children}
    </AIStatusContext.Provider>
  )
}

export function useAIStatus() {
  return useContext(AIStatusContext)
}

// ─── AI BADGE ────────────────────────────────────────────────────
export function AIBadge() {
  const { status, lastOp, method } = useAIStatus()

  const cfg = {
    idle:       { ico: '⚪', label: 'AI standby',          color: 'rgba(107,122,153,.5)', op: 0.6 },
    processing: { ico: '🟡', label: 'AI in elaborazione...', color: 'rgba(200,164,94,.85)', op: 1, pulse: true },
    done:       {
      ico:   method === 'local' ? '⚡' : '🟢',
      label: method === 'local' ? `Parsing locale · ${lastOp || ''}` : `AI usata · ${lastOp || ''}`,
      color: method === 'local' ? 'rgba(78,142,247,.85)' : 'rgba(52,194,122,.85)',
      op: 1
    }
  }[status] || {}

  return (
    <div style={{
      position: 'fixed', bottom: 18, right: 18, zIndex: 9999,
      background: 'var(--s1)', border: '1px solid var(--bd)',
      borderRadius: 20, padding: '.35rem .85rem',
      display: 'flex', alignItems: 'center', gap: '.45rem',
      fontSize: '.72rem', color: cfg.color,
      opacity: cfg.op, transition: 'opacity .4s',
      animation: cfg.pulse ? 'aiBadgePulse 1.4s infinite' : 'none',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 2px 12px rgba(0,0,0,.25)'
    }}>
      <span>{cfg.ico}</span>
      <span style={{ color: 'var(--tx)', opacity: .8 }}>{cfg.label}</span>
    </div>
  )
}
