/**
 * Helper UI per Stampa Definitiva e Consolidamento - FASE 13D-B4
 */

/**
 * Mappa i tipi di stampa della UI verso i tipi canonici accettati dall'RPC.
 * @param {string} uiType 
 * @param {string} [registroTipo] ('vendite', 'acquisti', 'corrispettivi')
 * @returns {string}
 */
export function mapUiTypeToCanonical(uiType, registroTipo = '') {
  if (uiType === 'giornale' || uiType === 'libro_giornale') {
    return 'libro_giornale';
  }
  if (uiType === 'registri_iva') {
    if (registroTipo === 'acquisti') return 'registro_iva_acquisti';
    if (registroTipo === 'vendite') return 'registro_iva_vendite';
    if (registroTipo === 'corrispettivi') return 'registro_iva_corrispettivi';
  }
  if (uiType === 'liquidazione_iva_periodica') {
    return 'liquidazione_iva_periodica';
  }
  return uiType;
}

/**
 * Genera un checksum deterministico non vuoto (SHA-256 tramite WebCrypto) con fallback.
 */
export async function generateStampaChecksum({
  societaId,
  tipoStampa,
  annoFiscale,
  periodoInizio,
  periodoFine,
  timestamp,
  rowsCount = 0,
  totaleComplessivo = 0
}) {
  const payload = {
    societaId,
    tipoStampa,
    annoFiscale,
    periodoInizio,
    periodoFine,
    timestamp: timestamp || new Date().toISOString(),
    rowsCount,
    totaleComplessivo
  };
  
  const rawStr = JSON.stringify(payload);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Deterministic fallback for test environments
    let hash = 5381;
    for (let i = 0; i < rawStr.length; i++) {
      hash = ((hash << 5) + hash) + rawStr.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'sha256-fallback-' + Math.abs(hash).toString(16);
  }
}
