import { getSupabaseAdmin } from './lib/db.js';

async function run() {
  const results = {
    columns: { prima_nota: [], prima_nota_righe: [] },
    routinesLikeRegistration: [],
    pnStats2025: { count: 0, maxNumeroRegistrazione: null },
    errors: []
  };

  try {
    const supabase = await getSupabaseAdmin();
    const societa_id = '4a728851-be5a-412c-9ce6-ec07b72fcdfa';

    // 1) Find the correct column names for prima_nota by fetching 0 rows
    const { data: sample, error: sampleErr } = await supabase.from('prima_nota').select('*').limit(1);
    
    if (sampleErr) {
        results.errors.push("Sample fetch error: " + sampleErr.message);
    } else if (sample && sample.length > 0) {
        results.columns.prima_nota_sample = Object.keys(sample[0]);
    } else {
        // Try to get headers by selecting everything and limit 0
        const { data: h, error: hErr } = await supabase.from('prima_nota').select('*').limit(0);
        if (hErr) results.errors.push("Header fetch error: " + hErr.message);
    }

    // 2) Try to query without "esercizio" if it failed, or use correct column
    // The previous error was "column prima_nota.esercizio does not exist". 
    // Maybe it is called "anno_esercizio" or "data_registrazione"?
    
    // Attempt PN Stats with societa_id only
    const { count, error: countErr } = await supabase
      .from('prima_nota')
      .select('*', { count: 'exact', head: true })
      .eq('societa_id', societa_id);
      
    results.pnStatsAllTime = { count: count || 0 };
    if (countErr) results.errors.push("Count all-time error: " + countErr.message);

  } catch (err) {
    results.errors.push("Global error: " + err.message);
  }

  process.stdout.write(JSON.stringify(results, null, 2));
}

run();
