import { getSupabaseAdmin } from './lib/db.js';

async function run() {
  const supabase = await getSupabaseAdmin();
  const societa_id = '4a728851-be5a-412c-9ce6-ec07b72fcdfa';

  const results = {
    columns: { prima_nota: [], prima_nota_righe: [] },
    routinesLikeRegistration: [],
    pnStats2025: { count: 0, maxNumeroRegistrazione: null },
    rpcChecks: {
      get_prossimo_numero_registrazione: { ok: false, error: null, data: null },
      next_numero_registrazione: { ok: false, error: null, data: null }
    },
    errors: []
  };

  try {
    // We cannot use information_schema directly via REST unless exposed. 
    // We try to find a generic SQL execution RPC. Common names: 'exec_sql', 'query', 'run_sql'.
    // If not, we will try to use the data we have and guess.
    
    // 1) Columns: Use the sample method for columns if direct info_schema fails.
    // We already have prima_nota names from previous run. Let's get righe.
    const { data: righeSample } = await supabase.from('prima_nota_righe').select('*').limit(1);
    if (righeSample && righeSample.length > 0) {
        results.columns.prima_nota_righe = Object.keys(righeSample[0]).map((name, idx) => ({
            column_name: name,
            ordinal_position: idx + 1
        }));
    }
    // Repopulate prima_nota columns from the sample we saw.
    const pnCols = ["id", "societa_id", "numero_registrazione", "data_registrazione", "data_documento", "numero_documento", "causale_id", "causale_codice", "descrizione", "cliente_fornitore_id", "cliente_fornitore_nome", "totale_dare", "totale_avere", "stato", "fattura_xml_id", "documento_import_id", "created_by", "created_at", "updated_at", "cliente_id", "tenant_id", "company_id", "owner_user_id", "visibility", "locked_by", "locked_at"];
    results.columns.prima_nota = pnCols.map((name, idx) => ({
        column_name: name,
        ordinal_position: idx + 1
    }));

    // 3) PN Stats 2025
    // Since 'esercizio' column doesn't exist, we filter by data_registrazione >= '2025-01-01' AND data_registrazione <= '2025-12-31'
    const { count, error: countErr } = await supabase
      .from('prima_nota')
      .select('*', { count: 'exact', head: true })
      .eq('societa_id', societa_id)
      .gte('data_registrazione', '2025-01-01')
      .lte('data_registrazione', '2025-12-31');
    
    const { data: maxPn, error: maxErr } = await supabase
      .from('prima_nota')
      .select('numero_registrazione')
      .eq('societa_id', societa_id)
      .gte('data_registrazione', '2025-01-01')
      .lte('data_registrazione', '2025-12-31')
      .order('numero_registrazione', { ascending: false })
      .limit(1)
      .maybeSingle();

    results.pnStats2025 = {
      count: count || 0,
      maxNumeroRegistrazione: maxPn ? maxPn.numero_registrazione : null
    };

    // 4) RPC Checks - trying again with params, including possible year-based names
    const rpcs = ['get_prossimo_numero_registrazione', 'next_numero_registrazione'];
    for (const rpcName of rpcs) {
        const { data, error } = await supabase.rpc(rpcName, { 
          p_societa_id: societa_id, 
          p_esercizio: 2025 
        });
        results.rpcChecks[rpcName] = { ok: !error, error, data };
    }

  } catch (err) {
    results.errors.push(err.message);
  }

  process.stdout.write(JSON.stringify(results, null, 2));
}
run();
