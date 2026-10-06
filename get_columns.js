import { getSupabaseAdmin } from './lib/db.js';
async function run() {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.from('documenti_import').select('*').limit(1);
  if (error) console.error(error);
  else console.log(Object.keys(data[0]));
}
run();
