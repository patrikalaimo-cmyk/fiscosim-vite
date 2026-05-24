import { getSupabaseAdmin } from "./lib/db.js";

async function run() {
  const db = await getSupabaseAdmin();
  const res = await db.rpc('get_table_columns', { 
    target_tables: ["prima_nota", "prima_nota_righe", "documenti_contabilita"] 
  });

  // If RPC fails or doesn't exist, try direct SQL if possible (though Supabase JS doesn't support raw SQL easily without a helper)
  // Let's try to query the tables directly to see if they exist or get their structure via a trick
  
  const tables = ["prima_nota", "prima_nota_righe", "documenti_contabilita"];
  const results = {};

  for (const table of tables) {
    const { data, error } = await db.from(table).select().limit(1);
    if (!error && data && data.length >= 0) {
       // Get keys from the first object or empty if no rows
       results[table] = data.length > 0 ? Object.keys(data[0]) : "No rows to infer columns";
    } else {
       results[table] = error ? error.message : "Not found";
    }
  }
  
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
