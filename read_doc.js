import { getSupabaseAdmin } from './lib/db.js';

async function run() {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('documenti_import')
    .select('ai_raw_response, numero, data, totale')
    .eq('id', 'd96ca48c-e427-4dbc-8bd7-49cb8edfafff')
    .eq('societa_destinazione_id', '4a728851-be5a-412c-9ce6-ec07b72fcdfa')
    .single();

  if (error) {
    console.error('Error fetching data:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('No data found');
    return;
  }

  const ai = data.ai_raw_response || {};
  console.log('Top-level keys of ai_raw_response:', Object.keys(ai));

  const paths = [
    ['fornitore', 'denominazione'],
    ['fornitore', 'partitaIva'],
    ['fornitore', 'codiceFiscale'],
    ['cliente', 'denominazione'],
    ['cliente', 'partitaIva'],
    ['cliente', 'codiceFiscale'],
    ['denominazioneFornitore'],
    ['pivaFornitore'],
    ['cfFornitore'],
    ['supplierName'],
    ['supplierVat'],
    ['supplierTaxCode']
  ];

  function getVal(obj, path) {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  console.log('Paths valorizzati:');
  paths.forEach(p => {
    const val = getVal(ai, p);
    if (val !== undefined && val !== null && val !== '') {
      console.log(`${p.join('.')}: ${val}`);
    }
  });

  console.log('Numero:', data.numero);
  console.log('Data:', data.data);
  console.log('Totale:', data.totale);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
