/**
 * Risoluzione del conto IVA split payment da causale o template.
 * Condiviso tra il workflow di Import Contabilità (lato server/DB) e la Registrazione Manuale (lato client/in-memory).
 */

const norm = (v) => String(v || '').trim()

/**
 * Risolve il conto split payment interrogando il database (usato in Import Contabilità).
 * @param {object} db Client database (Supabase o Mock)
 * @param {object} causale Causale o template di configurazione
 * @returns {Promise<{id: string, codice: string, descrizione: string} | null>}
 */
export async function resolveSplitPaymentAccountDb(db, causale = {}) {
  const id = norm(
    causale?.conto_iva_split_payment ||
    causale?.contoIvaSplitPayment ||
    causale?.conto_split_payment ||
    causale?.contoSplitPayment
  )

  if (id) {
    // Risoluzione diretta del conto da piano dei conti
    const { data: contoData } = await db
      .from('piano_conti')
      .select('id, codice, descrizione')
      .eq('id', id)
      .maybeSingle()

    if (contoData) {
      return {
        id: contoData.id,
        codice: contoData.codice || '',
        descrizione: contoData.descrizione || 'IVA split payment',
      }
    }

    return {
      id,
      codice: causale?.conto_iva_split_payment_codice || '',
      descrizione: causale?.conto_iva_split_payment_descrizione || 'IVA split payment',
    }
  }

  // Se non è nell'oggetto causale fornito, prova con la causale nel DB
  const causaleId = causale?.id
  if (causaleId) {
    const { data: dbCausale } = await db
      .from('causali_contabili')
      .select('conto_iva_split_payment')
      .eq('id', causaleId)
      .maybeSingle()

    if (dbCausale && dbCausale.conto_iva_split_payment) {
      const contoId = dbCausale.conto_iva_split_payment
      const { data: contoData } = await db
        .from('piano_conti')
        .select('id, codice, descrizione')
        .eq('id', contoId)
        .maybeSingle()

      if (contoData) {
        return {
          id: contoData.id,
          codice: contoData.codice || '',
          descrizione: contoData.descrizione || 'IVA split payment',
        }
      }
      return {
        id: contoId,
        codice: '',
        descrizione: 'IVA split payment',
      }
    }
  }

  return null
}

/**
 * Risolve il conto split payment in-memory (usato in Registrazione Manuale UI).
 * @param {object} causale Causale o template di configurazione
 * @param {Array} pianoConti Catalogo del piano dei conti in-memory
 * @returns {{id: string, codice: string, descrizione: string} | null}
 */
export function resolveSplitPaymentAccountCatalog(causale = {}, pianoConti = []) {
  const id = norm(
    causale?.conto_iva_split_payment ||
    causale?.contoIvaSplitPayment ||
    causale?.conto_split_payment ||
    causale?.contoSplitPayment
  )

  const catalog = Array.isArray(pianoConti) ? pianoConti : []

  if (id) {
    const directMatch = catalog.find((item) => norm(item?.id) === id)
    if (directMatch) {
      return {
        id: norm(directMatch.id),
        codice: norm(directMatch.codice || directMatch.code || directMatch.sigla),
        descrizione: norm(directMatch.descrizione || directMatch.description || directMatch.denominazione || directMatch.nome || 'IVA split payment'),
      }
    }

    const codeMatch = catalog.filter((item) => norm(item?.codice || item?.code || item?.sigla) === id)
    if (codeMatch.length === 1) {
      const match = codeMatch[0]
      return {
        id: norm(match.id),
        codice: norm(match.codice || match.code || match.sigla),
        descrizione: norm(match.descrizione || match.description || match.denominazione || match.nome || 'IVA split payment'),
      }
    }
  }

  return null
}
