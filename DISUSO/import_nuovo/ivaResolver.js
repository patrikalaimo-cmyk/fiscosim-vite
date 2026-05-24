import { resolveIva as resolveIvaCore, ResolveIvaError } from '../../../domain/resolveIva.js'

/**
 * Compatibilità import_nuovo: (aliquota, causaliIva, riga) — passa natura se presente sulla riga.
 * @returns {string|null}
 */
export function resolveIva(aliquota, causaliIva, riga) {
  const natura = riga?.natura ?? riga?.Natura ?? riga?.codice_natura ?? undefined
  try {
    return resolveIvaCore({ conto: null, aliquota, natura, causaliIva, pipelineContext: undefined }) || null
  } catch (e) {
    if (e instanceof ResolveIvaError) return null
    throw e
  }
}
