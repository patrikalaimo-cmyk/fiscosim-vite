import { sb } from '../../../lib/supabase.js'

/**
 * Recupera i controlli di sicurezza e le barriere operative (guards) per una determinata scrittura contabile.
 *
 * @param {string} primaNotaId - UUID della registrazione di Prima Nota.
 * @param {string} societaId - UUID della società.
 * @param {string} operationType - Tipo di operazione da validare ('UPDATE', 'ANNULLA', 'STORNO', 'DELETE_FISICA').
 * @returns {Promise<{data: {can_execute: boolean, blocking_reasons: string[], warnings: string[], suggested_action: string} | null, error: any}>}
 */
export async function getOperationGuards(primaNotaId, societaId, operationType) {
  try {
    if (!primaNotaId || !societaId || !operationType) {
      return {
        data: {
          can_execute: false,
          blocking_reasons: ['Parametri obbligatori mancanti per getOperationGuards.'],
          warnings: [],
          suggested_action: 'blocca',
        },
        error: null,
      }
    }

    const { data, error } = await sb.rpc('rpc_get_prima_nota_operation_guards', {
      p_prima_nota_id: primaNotaId,
      p_societa_id: societaId,
      p_operation_type: operationType,
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Esegue la modifica transazionale in-place controllata di testata e righe di Prima Nota.
 *
 * @param {string} primaNotaId - UUID della registrazione da modificare.
 * @param {string} societaId - UUID della società.
 * @param {object} header - Dati della testata (data_registrazione, causale_codice, descrizione, etc.).
 * @param {object[]} rows - Array di righe contabili (riga_numero, conto_id, importo_dare, importo_avere, etc.).
 * @param {string} motivo - Giustificazione della modifica contabile (minimo 15 caratteri).
 * @param {string} utenteId - UUID dell'operatore che effettua la modifica.
 * @returns {Promise<{data: {success: boolean, primaNotaId: string, versione: number, message: string} | null, error: any}>}
 */
export async function updatePrimaNotaControllata(primaNotaId, societaId, header, rows, motivo, utenteId) {
  try {
    if (!primaNotaId || !societaId || !header || !rows || !motivo || !utenteId) {
      throw new Error('Parametri obbligatori mancanti per updatePrimaNotaControllata.')
    }

    if (motivo.trim().length < 15) {
      return {
        data: {
          success: false,
          error: 'Giustificazione insufficiente.',
          blockers: ['Il motivo della modifica deve contenere almeno 15 caratteri per finalità di audit.'],
        },
        error: null,
      }
    }

    const { data, error } = await sb.rpc('rpc_update_prima_nota_generale_controllata', {
      p_prima_nota_id: primaNotaId,
      p_societa_id: societaId,
      p_header: header,
      p_rows: rows,
      p_motivo: motivo,
      p_utente_id: utenteId,
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Esegue l'annullamento logico di una registrazione contabile (senza eliminazione fisica delle righe).
 *
 * @param {string} primaNotaId - UUID della registrazione da annullare.
 * @param {string} societaId - UUID della società.
 * @param {string} motivo - Giustificazione dell'annullamento (minimo 15 caratteri).
 * @param {string} utenteId - UUID dell'operatore che esegue l'operazione.
 * @returns {Promise<{data: {success: boolean, primaNotaId: string, message: string} | null, error: any}>}
 */
export async function annullaPrimaNotaLogica(primaNotaId, societaId, motivo, utenteId) {
  try {
    if (!primaNotaId || !societaId || !motivo || !utenteId) {
      throw new Error('Parametri obbligatori mancanti per annullaPrimaNotaLogica.')
    }

    if (motivo.trim().length < 15) {
      return {
        data: {
          success: false,
          error: 'Giustificazione insufficiente.',
          blockers: ['Il motivo dell\'annullamento deve contenere almeno 15 caratteri per finalità di audit.'],
        },
        error: null,
      }
    }

    const { data, error } = await sb.rpc('rpc_annulla_prima_nota_logica', {
      p_prima_nota_id: primaNotaId,
      p_societa_id: societaId,
      p_motivo: motivo,
      p_utente_id: utenteId,
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Genera una contro-scrittura speculare Dare/Avere invertiti per stornare una registrazione.
 *
 * @param {string} primaNotaId - UUID della registrazione originale da stornare.
 * @param {string} societaId - UUID della società.
 * @param {string} motivo - Giustificazione dello storno contabile (minimo 15 caratteri).
 * @param {string} dataStorno - Data di registrazione dello storno (YYYY-MM-DD). Se non passata, usa la data corrente.
 * @param {string} utenteId - UUID dell'operatore che esegue lo storno.
 * @returns {Promise<{data: {success: boolean, stornoId: string, numeroStorno: number, message: string} | null, error: any}>}
 */
export async function stornaPrimaNota(primaNotaId, societaId, motivo, dataStorno, utenteId) {
  try {
    if (!primaNotaId || !societaId || !motivo || !utenteId) {
      throw new Error('Parametri obbligatori mancanti per stornaPrimaNota.')
    }

    if (motivo.trim().length < 15) {
      return {
        data: {
          success: false,
          error: 'Giustificazione storno insufficiente.',
          blockers: ['Il motivo dello storno deve contenere almeno 15 caratteri per finalità di audit contabile.'],
        },
        error: null,
      }
    }

    const { data, error } = await sb.rpc('rpc_storna_prima_nota_generale', {
      p_prima_nota_id: primaNotaId,
      p_societa_id: societaId,
      p_motivo: motivo,
      p_data_storno: dataStorno || null,
      p_utente_id: utenteId,
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}
