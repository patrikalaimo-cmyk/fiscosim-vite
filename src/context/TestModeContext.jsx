import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

/**
 * TestModeBadge — badge fisso in basso a destra
 * Visibile solo quando test_mode = true in impostazioni_studio
 * Si aggiorna in tempo reale ogni 10s (o quando cambia)
 */
export function TestModeBadge() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const { data, error } = await sb
          .from('impostazioni_studio')
          .select('valore')
          .eq('chiave', 'test_mode')
        // data è un array (senza .single()) — nessun 406 se la riga manca
        if (!error && Array.isArray(data) && data.length > 0) {
          setActive(data[0].valore === 'true')
        } else {
          setActive(false)
        }
      } catch {
        setActive(false)
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 54,  // sopra l'AIBadge
      right: 18,
      zIndex: 9998,
      background: 'rgba(99,217,196,.15)',
      border: '1px solid rgba(99,217,196,.5)',
      borderRadius: 20,
      padding: '.3rem .85rem',
      display: 'flex',
      alignItems: 'center',
      gap: '.4rem',
      fontSize: '.72rem',
      color: '#63d9c4',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 2px 12px rgba(99,217,196,.2)',
      userSelect: 'none',
    }}>
      <span>🧪</span>
      <span style={{ fontWeight: 700, letterSpacing: '.05em' }}>TEST MODE</span>
    </div>
  )
}
