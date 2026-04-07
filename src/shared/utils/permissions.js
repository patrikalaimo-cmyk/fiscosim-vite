import { PERMESSI_MODULI, PERMESSI_DEFAULT } from '../constants'

export function getPermessi(utente) {
  if (!utente) return null
  if (utente.ruolo === 'owner' || utente.ruolo === 'admin') {
    return Object.fromEntries(
      PERMESSI_MODULI.map((m) => [m.id, { leggi: true, modifica: true, elimina: true, solo_assegnati: false }])
    )
  }
  return { ...PERMESSI_DEFAULT, ...(utente.permessi || {}) }
}

export const canLeggi = (perm, modulo) => perm?.[modulo]?.leggi !== false
export const canModifica = (perm, modulo) => perm?.[modulo]?.modifica === true
export const canElimina = (perm, modulo) => perm?.[modulo]?.elimina === true
export const isSoloAssegnati = (perm, modulo) => perm?.[modulo]?.solo_assegnati === true
export const puoGestireUtenti = (ruolo) => ruolo === 'owner'
export const puoGestireRegoleFiscaliIA = (ruolo) => ruolo === 'owner' || ruolo === 'admin'

