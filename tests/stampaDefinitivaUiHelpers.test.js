import { test } from 'node:test';
import assert from 'node:assert';
import {
  mapUiTypeToCanonical,
  generateStampaChecksum
} from '../src/modules/contabilita/application/stampe/stampaDefinitivaUiHelpers.js';

test('Verifica mapping UI -> Tipi Canonici', () => {
  // giornale -> libro_giornale
  assert.strictEqual(mapUiTypeToCanonical('giornale'), 'libro_giornale');
  assert.strictEqual(mapUiTypeToCanonical('libro_giornale'), 'libro_giornale');

  // registri_iva + subtypes
  assert.strictEqual(mapUiTypeToCanonical('registri_iva', 'acquisti'), 'registro_iva_acquisti');
  assert.strictEqual(mapUiTypeToCanonical('registri_iva', 'vendite'), 'registro_iva_vendite');
  assert.strictEqual(mapUiTypeToCanonical('registri_iva', 'corrispettivi'), 'registro_iva_corrispettivi');

  // liquidazione_iva_periodica
  assert.strictEqual(mapUiTypeToCanonical('liquidazione_iva_periodica'), 'liquidazione_iva_periodica');
});

test('Generazione Checksum deterministico non vuoto', async () => {
  const params = {
    societaId: 'soc-123',
    tipoStampa: 'libro_giornale',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-02-28',
    timestamp: '2026-06-21T00:00:00.000Z',
    rowsCount: 30,
    totaleComplessivo: 1000.50
  };

  const checksum1 = await generateStampaChecksum(params);
  const checksum2 = await generateStampaChecksum(params);

  assert.ok(checksum1 && checksum1.length > 0);
  assert.strictEqual(checksum1, checksum2);

  // Modifica di un valore -> checksum diverso
  const checksumDifferent = await generateStampaChecksum({
    ...params,
    rowsCount: 31
  });
  assert.notStrictEqual(checksum1, checksumDifferent);
});
