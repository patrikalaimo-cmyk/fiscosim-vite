import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const pnId = "c2e586a5-8425-47d9-87ed-a8b2c78fe6d2";
const societaId = "4a728851-be5a-412c-9ce6-ec07b72fcdfa";
const documentId = "d7cfe444-229d-405b-863d-3ea4448d1748";

async function run() {
  const results = {};
  const nowMinus20 = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  // 1) SELECT prima_nota
  const { data: pn } = await supabase
    .from("prima_nota")
    .select("id, societa_id, esercizio, numero_registrazione, data_registrazione, numero_documento, causale_id, stato, tipo_registrazione, totale_dare, totale_avere, created_at")
    .eq("id", pnId)
    .single();
  results.prima_nota = pn;

  // 2) SELECT prima_nota_righe
  const { data: righe } = await supabase
    .from("prima_nota_righe")
    .select("id, riga_numero, conto_id, importo_dare, importo_avere, created_at")
    .eq("prima_nota_id", pnId)
    .order("riga_numero", { ascending: true });
  results.righe = righe || [];

  // 3) Somma dare/avere
  const dare = (results.righe || []).reduce((acc, r) => acc + (Number(r.importo_dare) || 0), 0);
  const avere = (results.righe || []).reduce((acc, r) => acc + (Number(r.importo_avere) || 0), 0);
  results.quadratura = { dare, avere, balanced: Math.abs(dare - avere) < 0.001 };

  // 4) SELECT documenti_contabilita
  const { data: doc } = await supabase
    .from("documenti_contabilita")
    .select("id, workflow_status, validation_status, prima_nota_id, registered_at, locked_by, locked_at")
    .eq("id", documentId)
    .single();
  results.documento = doc;

  // 5, 6, 7, 8) Counts
  const { count: ri_count } = await supabase.from("registri_iva").select("*", { count: "exact", head: true }).eq("societa_id", societaId).gt("created_at", nowMinus20);
  const { count: part_count } = await supabase.from("partitario").select("*", { count: "exact", head: true }).eq("societa_id", societaId).gt("created_at", nowMinus20);
  const { count: pn_count } = await supabase.from("prima_nota").select("*", { count: "exact", head: true }).eq("societa_id", societaId).gt("created_at", nowMinus20);
  const { count: pnr_count } = await supabase.from("prima_nota_righe").select("*", { count: "exact", head: true }).gt("created_at", nowMinus20);

  results.counts = {
    prima_nota_recent: pn_count,
    prima_nota_righe_recent: pnr_count,
    registri_iva_recent: ri_count,
    partitario_recent: part_count
  };

  // 9) Schema check (via rpc if possible or select from table)
  // Since we cannot query information_schema directly via PostgREST easily without RPC, 
  // we check if we can fetch columns by a dummy select or check metadata.
  // Using a simpler approach: check if columns exist by selecting them (will error if not exist)
  
  const checkCol = async (table, cols) => {
    const { data, error } = await supabase.from(table).select(cols.join(",")).limit(1);
    const presence = {};
    cols.forEach(c => {
        presence[c] = !error || !error.message.includes(`column "${c}" does not exist`);
    });
    return presence;
  };

  const pnPresence = await checkCol("prima_nota", ["documento_id", "tipo_registrazione"]);
  const docPresence = await checkCol("documenti_contabilita", ["prima_nota_id"]);

  results.schema_presence = {
    prima_nota: pnPresence,
    documenti_contabilita: docPresence
  };

  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);
