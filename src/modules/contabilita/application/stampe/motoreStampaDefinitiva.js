/**
 * Motore Stampa Definitiva e Blocco Periodo - FASE 13D-B2/B3
 * Gestisce l'interfacciamento con le funzioni di precheck e consolidamento transazionali del database.
 */

/**
 * Esegue i controlli preliminari (coerenza date, sbilanci, duplicati, scritture simulate) prima del consolidamento definitivo.
 * @param {object} supabaseClient client Supabase autenticato
 * @param {object} params
 * @param {string} params.societaId UUID della società
 * @param {string} params.tipoStampa libro_giornale | registro_iva_acquisti | registro_iva_vendite | registro_iva_corrispettivi | liquidazione_iva_periodica
 * @param {number} params.annoFiscale esercizio di riferimento (es. 2026)
 * @param {string} params.periodoInizio data di inizio (YYYY-MM-DD)
 * @param {string} params.periodoFine data di fine (YYYY-MM-DD)
 */
export async function precheckStampaDefinitiva(supabaseClient, {
  societaId,
  tipoStampa,
  annoFiscale,
  periodoInizio,
  periodoFine
}) {
  const blockingReasons = [];
  
  // Validazioni formali client-side preliminari
  if (!societaId) {
    blockingReasons.push('Società non specificata.');
  }
  if (!['libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica'].includes(tipoStampa)) {
    blockingReasons.push('Tipo stampa non ammesso o non supportato.');
  }
  if (!periodoInizio || !periodoFine || new Date(periodoInizio) > new Date(periodoFine)) {
    blockingReasons.push('Periodo non valido o incoerente.');
  }
  if (!annoFiscale || annoFiscale <= 0) {
    blockingReasons.push('Esercizio (anno fiscale) non valido.');
  }

  if (blockingReasons.length > 0) {
    return {
      data: {
        success: false,
        blocking_reasons: blockingReasons,
        warnings: [],
        rows_count: 0
      },
      error: null
    };
  }

  // Chiamata alla stored procedure PostgreSQL (RPC)
  const { data, error } = await supabaseClient.rpc('precheck_stampa_definitiva', {
    p_societa_id: societaId,
    p_tipo_stampa: tipoStampa,
    p_anno_fiscale: annoFiscale,
    p_periodo_inizio: periodoInizio,
    p_periodo_fine: periodoFine
  });

  return { data, error };
}

/**
 * Consolida in via definitiva il Libro Giornale o i Registri IVA, calcolando progressivi, protoccolli e bloccando il periodo.
 * @param {object} supabaseClient client Supabase autenticato
 * @param {object} params
 * @param {string} params.societaId UUID della società
 * @param {string} params.tipoStampa libro_giornale | registro_iva_acquisti | registro_iva_vendite | registro_iva_corrispettivi | liquidazione_iva_periodica
 * @param {number} params.annoFiscale esercizio di riferimento (es. 2026)
 * @param {string} params.periodoInizio data di inizio (YYYY-MM-DD)
 * @param {string} params.periodoFine data di fine (YYYY-MM-DD)
 * @param {string} params.creatoBy UUID dell'operatore di studio
 * @param {string} params.checksum hash di inalterabilità dei dati stampati
 * @param {string} [params.motivo] motivazione del consolidamento o note dell'operatore
 * @param {object} [params.metadata] metadati aggiuntivi strutturati
 */
export async function consolidazioneStampaDefinitiva(supabaseClient, {
  societaId,
  tipoStampa,
  annoFiscale,
  periodoInizio,
  periodoFine,
  creatoBy,
  checksum,
  motivo = null,
  metadata = {}
}) {
  // 1. Eseguiamo prima la validazione formale
  const checkRes = await precheckStampaDefinitiva(supabaseClient, {
    societaId,
    tipoStampa,
    annoFiscale,
    periodoInizio,
    periodoFine
  });

  if (checkRes.error) {
    return { data: null, error: checkRes.error };
  }
  
  if (checkRes.data && !checkRes.data.success) {
    return {
      data: checkRes.data,
      error: new Error('Precheck fallito: ' + checkRes.data.blocking_reasons.join('; '))
    };
  }

  // 2. Chiamata alla stored procedure transazionale PostgreSQL (RPC)
  const { data, error } = await supabaseClient.rpc('consolidazione_stampa_definitiva', {
    p_societa_id: societaId,
    p_tipo_stampa: tipoStampa,
    p_anno_fiscale: annoFiscale,
    p_periodo_inizio: periodoInizio,
    p_periodo_fine: periodoFine,
    p_creato_by: creatoBy,
    p_checksum: checksum,
    p_motivo: motivo,
    p_metadata: metadata
  });

  return { data, error };
}
