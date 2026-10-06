import { getSupabaseAdmin } from './lib/db.js';

async function run() {
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
    const supabase = await getSupabaseAdmin();
    const societa_id = '4a728851-be5a-412c-9ce6-ec07b72fcdfa';
    const esercizio = 2025;

    // 3) PN Stats
    const { count, error: countErr } = await supabase
      .from('prima_nota')
      .select('*', { count: 'exact', head: true })
      .eq('societa_id', societa_id)
      .eq('esercizio', esercizio);
    
    const { data: maxPn, error: maxErr } = await supabase
      .from('prima_nota')
      .select('numero_registrazione')
      .eq('societa_id', societa_id)
      .eq('esercizio', esercizio)
      .order('numero_registrazione', { ascending: false })
      .limit(1)
      .maybeSingle();

    results.pnStats2025 = {
      count: count || 0,
      maxNumeroRegistrazione: maxPn ? maxPn.numero_registrazione : null
    };
    if (countErr) results.errors.push("Count error: " + countErr.message);
    if (maxErr) results.errors.push("Max error: " + maxErr.message);

    // 4) RPC Checks
    const rpcs = ['get_prossimo_numero_registrazione', 'next_numero_registrazione'];
    for (const rpcName of rpcs) {
      try {
        const { data, error } = await supabase.rpc(rpcName, { 
          p_societa_id: societa_id, 
          p_esercizio: esercizio 
        });
        results.rpcChecks[rpcName] = { ok: !error, error, data };
      } catch (e) {
        results.rpcChecks[rpcName] = { ok: false, error: e.message, data: null };
      }
    }

    // 1 & 2) Information Schema
    try {
      const { data: cols, error: cErr } = await supabase
        .schema('information_schema')
        .from('columns')
        .select('table_name,column_name,data_type,udt_name,is_nullable,column_default,ordinal_position')
        .eq('table_schema', 'public')
        .in('table_name', ['prima_nota', 'prima_nota_righe'])
        .order('table_name')
        .order('ordinal_position');
      
      if (cols) {
        results.columns.prima_nota = cols.filter(c => c.table_name === 'prima_nota');
        results.columns.prima_nota_righe = cols.filter(c => c.table_name === 'prima_nota_righe');
      } else if (cErr) {
        results.errors.push("Columns fetch error: " + cErr.message);
      }
    } catch(e) { results.errors.push("Columns fetch exception: " + e.message); }

    try {
      const { data: routines, error: rErr } = await supabase
        .schema('information_schema')
        .from('routines')
        .select('routine_name,data_type,specific_name,routine_definition')
        .eq('table_schema', 'public')
        .or('routine_name.ilike.%numero%registrazione%,routine_name.ilike.%prossimo%,routine_name.ilike.%next%,routine_name.ilike.%registrazione%');
      
      if (routines) {
        results.routinesLikeRegistration = routines;
      } else if (rErr) {
        results.errors.push("Routines fetch error: " + rErr.message);
      }
    } catch(e) { results.errors.push("Routines fetch exception: " + e.message); }

  } catch (err) {
    results.errors.push("Global error: " + err.message);
  }

  process.stdout.write(JSON.stringify(results, null, 2));
}

run();
