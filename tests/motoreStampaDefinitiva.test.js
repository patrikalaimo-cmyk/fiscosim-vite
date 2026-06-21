import { test } from 'node:test';
import assert from 'node:assert';
import {
  precheckStampaDefinitiva,
  consolidazioneStampaDefinitiva
} from '../src/modules/contabilita/application/stampe/motoreStampaDefinitiva.js';

// Setup Mock database state and client with new functional rules
function createMockSupabaseClient() {
  const db = {
    stampe: [],
    societa: [
      { id: 'soc-A', denominazione: 'Società Mensile', tipo_liquidazione_iva: 'mensile' },
      { id: 'soc-B', denominazione: 'Società Trimestrale', tipo_liquidazione_iva: 'trimestrale' },
      { id: 'soc-no-per', denominazione: 'Società Senza Periodo', tipo_liquidazione_iva: null }
    ],
    liquidazione_iva: [
      { id: 'liq-1', societa_id: 'soc-A', periodo_inizio: '2026-01-01', periodo_fine: '2026-01-31', iva_debito: 100, iva_credito: 50, saldo: 50, note: '' }
    ],
    prima_nota: [
      {
        id: 'pn-1',
        societa_id: 'soc-A',
        totale_dare: 100,
        totale_avere: 100,
        data_registrazione: '2026-01-10',
        numero_registrazione: 1,
        stato: 'confermata',
        periodo_chiuso_lock: false,
        stampa_giornale_id: null,
        giornale_pagina: null,
        giornale_riga_progressivo: null
      },
      {
        id: 'pn-2',
        societa_id: 'soc-A',
        totale_dare: 150,
        totale_avere: 150,
        data_registrazione: '2026-01-20',
        numero_registrazione: 2,
        stato: 'confermata',
        periodo_chiuso_lock: false,
        stampa_giornale_id: null,
        giornale_pagina: null,
        giornale_riga_progressivo: null
      },
      {
        id: 'pn-3-simulata',
        societa_id: 'soc-A',
        totale_dare: 80,
        totale_avere: 80,
        data_registrazione: '2026-01-25',
        numero_registrazione: 3,
        stato: 'simulata',
        periodo_chiuso_lock: false,
        stampa_giornale_id: null,
        giornale_pagina: null,
        giornale_riga_progressivo: null
      }
    ],
    prima_nota_righe: [
      { id: 'pnr-1', prima_nota_id: 'pn-1', importo_dare: 100, importo_avere: 0 },
      { id: 'pnr-2', prima_nota_id: 'pn-1', importo_dare: 0, importo_avere: 100 },
      { id: 'pnr-3', prima_nota_id: 'pn-2', importo_dare: 150, importo_avere: 0 },
      { id: 'pnr-4', prima_nota_id: 'pn-2', importo_dare: 0, importo_avere: 150 }
    ],
    registri_iva: [
      {
        id: 'iva-1',
        societa_id: 'soc-A',
        tipo: 'acquisto',
        imponibile: 100,
        iva: 22,
        data: '2026-01-12',
        prima_nota_id: 'pn-1',
        stampa_iva_id: null,
        registro_pagina: null,
        registro_protocollo_definitivo: null
      },
      {
        id: 'iva-2',
        societa_id: 'soc-A',
        tipo: 'acquisto',
        imponibile: 200,
        iva: 44,
        data: '2026-01-22',
        prima_nota_id: 'pn-2',
        stampa_iva_id: null,
        registro_pagina: null,
        registro_protocollo_definitivo: null
      },
      {
        id: 'iva-3',
        societa_id: 'soc-A',
        tipo: 'vendita',
        imponibile: 300,
        iva: 66,
        data: '2026-01-15',
        prima_nota_id: 'pn-1',
        stampa_iva_id: null,
        registro_pagina: null,
        registro_protocollo_definitivo: null
      }
    ],
    audit_log: []
  };

  const rpc = async (fnName, args) => {
    if (fnName === 'precheck_stampa_definitiva') {
      const {
        p_societa_id: societaId,
        p_tipo_stampa: tipoStampa,
        p_anno_fiscale: annoFiscale,
        p_periodo_inizio: periodoInizio,
        p_periodo_fine: periodoFine
      } = args;

      const blockingReasons = [];
      const warnings = [];

      // Parameter validation
      if (!societaId) blockingReasons.push('Società non specificata.');
      if (!['libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica'].includes(tipoStampa)) {
        blockingReasons.push('Tipo stampa non ammesso o non supportato.');
      }
      if (!periodoInizio || !periodoFine || periodoInizio > periodoFine) {
        blockingReasons.push('Periodo non valido o incoerente.');
      }
      if (!annoFiscale || annoFiscale <= 0) {
        blockingReasons.push('Esercizio (anno fiscale) non valido.');
      }

      if (blockingReasons.length > 0) {
        return { data: { success: false, blocking_reasons: blockingReasons, warnings }, error: null };
      }

      // Check year match
      const [yStart, mStart, dStart] = periodoInizio.split('-').map(Number);
      const [yEnd, mEnd, dEnd] = periodoFine.split('-').map(Number);
      if (yStart !== annoFiscale || yEnd !== annoFiscale) {
        blockingReasons.push("L'anno delle date del periodo deve corrispondere all'anno fiscale specificato.");
      }

      const monthLengths = [31, (yStart % 4 === 0 && (yStart % 100 !== 0 || yStart % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

      if (['registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica'].includes(tipoStampa)) {
        const soc = db.societa.find(s => s.id === societaId);
        if (!soc || !soc.tipo_liquidazione_iva) {
          blockingReasons.push('Periodicità IVA della società non configurata o non rilevabile.');
        } else if (soc.tipo_liquidazione_iva === 'mensile') {
          const expectedEndDay = monthLengths[mStart - 1];
          if (dStart !== 1 || dEnd !== expectedEndDay || mStart !== mEnd || yStart !== yEnd) {
            blockingReasons.push('Il periodo selezionato deve corrispondere esattamente a un mese intero per società mensili.');
          }
        } else if (soc.tipo_liquidazione_iva === 'trimestrale') {
          if (dStart !== 1 || ![1, 4, 7, 10].includes(mStart)) {
            blockingReasons.push('Il periodo selezionato deve corrispondere esattamente a un trimestre intero per società trimestrali.');
          } else {
            const expectedEndDay = monthLengths[mStart + 1];
            const expectedEndMonth = mStart + 2;
            if (dEnd !== expectedEndDay || mEnd !== expectedEndMonth || yStart !== yEnd) {
              blockingReasons.push('Il periodo selezionato deve corrispondere esattamente a un trimestre intero per società trimestrali.');
            }
          }
        }
      }

      // Check bi-monthly Libro Giornale
      if (tipoStampa === 'libro_giornale') {
        if (dStart !== 1 || ![1, 3, 5, 7, 9, 11].includes(mStart)) {
          blockingReasons.push('Il periodo selezionato deve corrispondere esattamente ad uno dei bimestri standard per il Libro Giornale.');
        } else {
          const expectedEndDay = monthLengths[mStart];
          const expectedEndMonth = mStart + 1;
          if (dEnd !== expectedEndDay || mEnd !== expectedEndMonth || yStart !== yEnd) {
            blockingReasons.push('Il periodo selezionato deve corrispondere esattamente ad uno dei bimestri standard per il Libro Giornale.');
          }
        }
      }

      // Block Corrispettivi
      if (tipoStampa === 'registro_iva_corrispettivi') {
        blockingReasons.push('Registro corrispettivi non consolidabile: manca un criterio dati reale per distinguerlo dal registro vendite.');
      }

      // Block Liquidazione if not present
      if (tipoStampa === 'liquidazione_iva_periodica') {
        const liq = db.liquidazione_iva.find(l => l.societa_id === societaId && l.periodo_inizio === periodoInizio && l.periodo_fine === periodoFine);
        if (!liq) {
          blockingReasons.push('Liquidazione periodica non trovata o non calcolata per il periodo specificato.');
        }
      }

      if (blockingReasons.length > 0) {
        return { data: { success: false, blocking_reasons: blockingReasons, warnings }, error: null };
      }

      // Imbalance Check for Journal
      if (tipoStampa === 'libro_giornale') {
        const hasSquadrati = db.prima_nota.some(
          p =>
            p.societa_id === societaId &&
            p.data_registrazione >= periodoInizio &&
            p.data_registrazione <= periodoFine &&
            p.stato !== 'simulata' &&
            p.totale_dare !== p.totale_avere
        );
        if (hasSquadrati) {
          blockingReasons.push('Sono presenti scritture non bilanciate (squadrate) nel periodo.');
        }

        // Already printed Check
        const alreadyPrinted = db.prima_nota.some(
          p =>
            p.societa_id === societaId &&
            p.data_registrazione >= periodoInizio &&
            p.data_registrazione <= periodoFine &&
            p.stato !== 'simulata' &&
            p.stampa_giornale_id !== null
        );
        if (alreadyPrinted) {
          blockingReasons.push('Alcune scritture di prima nota nel periodo sono già state incluse in una stampa definitiva.');
        }
      }

      if (['registro_iva_acquisti', 'registro_iva_vendite'].includes(tipoStampa)) {
        const alreadyPrinted = db.registri_iva.some(
          r =>
            r.societa_id === societaId &&
            r.data >= periodoInizio &&
            r.data <= periodoFine &&
            ((tipoStampa === 'registro_iva_acquisti' && r.tipo === 'acquisto') ||
             (tipoStampa === 'registro_iva_vendite' && r.tipo === 'vendita')) &&
            r.stampa_iva_id !== null
        );
        if (alreadyPrinted) {
          blockingReasons.push('Alcune righe IVA nel periodo sono già state incluse in una stampa definitiva.');
        }
      }

      // Rows count
      let rowsCount = 0;
      if (tipoStampa === 'libro_giornale') {
        rowsCount = db.prima_nota.filter(p => p.societa_id === societaId && p.data_registrazione >= periodoInizio && p.data_registrazione <= periodoFine && p.stato !== 'simulata').length;
      } else if (tipoStampa === 'liquidazione_iva_periodica') {
        rowsCount = 1;
      } else {
        rowsCount = db.registri_iva.filter(r => r.societa_id === societaId && r.data >= periodoInizio && r.data <= periodoFine &&
          ((tipoStampa === 'registro_iva_acquisti' && r.tipo === 'acquisto') ||
           (tipoStampa === 'registro_iva_vendite' && r.tipo === 'vendita'))).length;
      }

      if (rowsCount === 0) {
        blockingReasons.push('Non ci sono righe contabili da stampare nel periodo selezionato.');
      }

      return {
        data: {
          success: blockingReasons.length === 0,
          blocking_reasons: blockingReasons,
          warnings,
          rows_count: rowsCount
        },
        error: null
      };
    }

    if (fnName === 'consolidazione_stampa_definitiva') {
      const {
        p_societa_id: societaId,
        p_tipo_stampa: tipoStampa,
        p_anno_fiscale: annoFiscale,
        p_periodo_inizio: periodoInizio,
        p_periodo_fine: periodoFine,
        p_creato_by: creatoBy,
        p_checksum: checksum,
        p_motivo: motivo,
        p_metadata: metadata
      } = args;

      if (!creatoBy) {
        return { data: null, error: new Error('Operatore creato_by obbligatorio.') };
      }
      if (!checksum) {
        return { data: null, error: new Error('Firma checksum obbligatoria.') };
      }

      const precheckRes = await rpc('precheck_stampa_definitiva', args);
      if (!precheckRes.data.success) {
        return { data: precheckRes.data, error: new Error('Precheck fallito: ' + precheckRes.data.blocking_reasons.join('; ')) };
      }

      // Family Mapping
      let famiglia = '';
      if (tipoStampa === 'libro_giornale') famiglia = 'libro_giornale';
      else if (tipoStampa === 'registro_iva_acquisti') famiglia = 'iva_acquisti';
      else famiglia = 'iva_vendite_corrispettivi_liquidazione';

      // Find last print in the SAME family
      const lastStampa = [...db.stampe]
        .filter(s => s.societa_id === societaId && s.famiglia_numerazione === famiglia && s.anno_fiscale === annoFiscale && s.stato === 'valida')
        .sort((a, b) => b.periodo_fine.localeCompare(a.periodo_fine))[0];

      const nextPage = lastStampa ? lastStampa.pagina_finale + 1 : 1;
      const nextRiga = lastStampa && lastStampa.riga_finale ? lastStampa.riga_finale + 1 : 1;

      const stampaId = `stampa-${Date.now()}`;
      let finalPage = nextPage;
      let finalRiga = nextRiga;
      let countElab = 0;

      if (tipoStampa === 'libro_giornale') {
        const pns = db.prima_nota
          .filter(p => p.societa_id === societaId && p.data_registrazione >= periodoInizio && p.data_registrazione <= periodoFine && p.stato !== 'simulata')
          .sort((a, b) => a.data_registrazione.localeCompare(b.data_registrazione));

        for (const p of pns) {
          const rCount = db.prima_nota_righe.filter(r => r.prima_nota_id === p.id).length;
          p.stampa_giornale_id = stampaId;
          p.giornale_pagina = finalPage;
          p.giornale_riga_progressivo = finalRiga;
          p.periodo_chiuso_lock = true;

          finalRiga += rCount;
          countElab += rCount;
          finalPage = nextPage + Math.floor((Math.max(countElab, 1) - 1) / 30);
        }
      } else if (['registro_iva_acquisti', 'registro_iva_vendite'].includes(tipoStampa)) {
        // Safe protocol sequence calculation: extract max number from existing registered protocols of same family & fiscal year
        let protocolSeq = 0;
        const registeredIvas = db.registri_iva.filter(r => {
          if (!r.stampa_iva_id || !r.registro_protocollo_definitivo) return false;
          const parentStampa = db.stampe.find(s => s.id === r.stampa_iva_id);
          return parentStampa && 
                 parentStampa.anno_fiscale === annoFiscale && 
                 parentStampa.stato === 'valida' && 
                 parentStampa.famiglia_numerazione === famiglia;
        });

        for (const r of registeredIvas) {
          const parts = r.registro_protocollo_definitivo.split('/');
          const seqStr = parts[2] ? parts[2].replace(/[^0-9]/g, '') : '0';
          const seq = parseInt(seqStr, 10) || 0;
          if (seq > protocolSeq) {
            protocolSeq = seq;
          }
        }

        const ivas = db.registri_iva
          .filter(r => r.societa_id === societaId && r.data >= periodoInizio && r.data <= periodoFine &&
            ((tipoStampa === 'registro_iva_acquisti' && r.tipo === 'acquisto') ||
             (tipoStampa === 'registro_iva_vendite' && r.tipo === 'vendita')));

        for (const r of ivas) {
          r.stampa_iva_id = stampaId;
          r.registro_pagina = finalPage;
          protocolSeq += 1;
          const registryPart = tipoStampa.substring(13).toUpperCase();
          r.registro_protocollo_definitivo = `${annoFiscale}/${registryPart}/${String(protocolSeq).padStart(6, '0')}`;

          const parentPn = db.prima_nota.find(p => p.id === r.prima_nota_id);
          if (parentPn) {
            parentPn.periodo_chiuso_lock = true;
          }

          countElab += 1;
          finalPage = nextPage + Math.floor((Math.max(countElab, 1) - 1) / 20);
        }
      } else if (tipoStampa === 'liquidazione_iva_periodica') {
        countElab = 1;
        finalPage = nextPage; // 1 page
      }

      // Save print
      db.stampe.push({
        id: stampaId,
        societa_id: societaId,
        tipo_stampa: tipoStampa,
        famiglia_numerazione: famiglia,
        anno_fiscale: annoFiscale,
        periodo_inizio: periodoInizio,
        periodo_fine: periodoFine,
        pagina_iniziale: nextPage,
        pagina_finale: finalPage,
        riga_iniziale: tipoStampa === 'libro_giornale' ? nextRiga : null,
        riga_finale: tipoStampa === 'libro_giornale' ? finalRiga - 1 : null,
        checksum,
        stato: 'valida',
        creato_by: creatoBy
      });

      return {
        data: {
          success: true,
          stampa_id: stampaId,
          pagina_iniziale: nextPage,
          pagina_finale: finalPage,
          righe_elaborate: countElab
        },
        error: null
      };
    }
  };

  return { db, rpc };
}

// --- Test 1: Family mapping and shared pages ---
test('Verifica famiglie numerazione e progressione condivisa', async () => {
  const client = createMockSupabaseClient();
  
  // Consolidiamo registro_iva_vendite (famiglia: iva_vendite_corrispettivi_liquidazione)
  // Periodo: 1 mese intero per soc-A (mensile)
  const resVendite = await consolidazioneStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_vendite',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    creatoBy: 'op-1',
    checksum: 'check-1'
  });
  assert.strictEqual(resVendite.data.success, true);
  assert.strictEqual(resVendite.data.pagina_iniziale, 1);
  // 1 riga vendita -> pagina finale 1
  assert.strictEqual(resVendite.data.pagina_finale, 1);

  // Consolidiamo liquidazione_iva_periodica (stessa famiglia: iva_vendite_corrispettivi_liquidazione)
  const resLiq = await consolidazioneStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'liquidazione_iva_periodica',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    creatoBy: 'op-1',
    checksum: 'check-2'
  });
  
  assert.strictEqual(resLiq.data.success, true);
  // Condivide la numerazione, quindi deve partire da pagina 2!
  assert.strictEqual(resLiq.data.pagina_iniziale, 2);
  assert.strictEqual(resLiq.data.pagina_finale, 2);
});

// --- Test 2: VAT Periodicity checks ---
test('Blocco periodo IVA incoerente con periodicità societaria', async () => {
  const client = createMockSupabaseClient();

  // soc-A è mensile. Proviamo a consolidare trimestrale (01-01 a 31-03)
  const res = await precheckStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-03-31'
  });
  assert.strictEqual(res.data.success, false);
  assert.ok(res.data.blocking_reasons.includes('Il periodo selezionato deve corrispondere esattamente a un mese intero per società mensili.'));

  // soc-B è trimestrale. Proviamo a consolidare mensile (01-01 a 31-01)
  const res2 = await precheckStampaDefinitiva(client, {
    societaId: 'soc-B',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31'
  });
  assert.strictEqual(res2.data.success, false);
  assert.ok(res2.data.blocking_reasons.includes('Il periodo selezionato deve corrispondere esattamente a un trimestre intero per società trimestrali.'));

  // soc-no-per non ha periodicità impostata
  const res3 = await precheckStampaDefinitiva(client, {
    societaId: 'soc-no-per',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31'
  });
  assert.strictEqual(res3.data.success, false);
  assert.ok(res3.data.blocking_reasons.includes('Periodicità IVA della società non configurata o non rilevabile.'));
});

// --- Test 3: Libro Giornale bi-monthly check ---
test('Blocco Libro Giornale non bimestrale standard', async () => {
  const client = createMockSupabaseClient();

  const res = await precheckStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'libro_giornale',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31' // 1 mese (sbagliato)
  });
  assert.strictEqual(res.data.success, false);
  assert.ok(res.data.blocking_reasons.includes('Il periodo selezionato deve corrispondere esattamente ad uno dei bimestri standard per il Libro Giornale.'));

  const res2 = await precheckStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'libro_giornale',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-02-28' // Gen-Feb (corretto)
  });
  assert.strictEqual(res2.data.success, true);
});

// --- Test 4: Corrispettivi data block ---
test('Blocco Registro Corrispettivi per assenza criterio discriminante reale', async () => {
  const client = createMockSupabaseClient();
  const res = await precheckStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_corrispettivi',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31'
  });
  assert.strictEqual(res.data.success, false);
  assert.ok(res.data.blocking_reasons.includes('Registro corrispettivi non consolidabile: manca un criterio dati reale per distinguerlo dal registro vendite.'));
});

// --- Test 5: Missing params validation ---
test('Blocco se creatoBy o checksum mancanti', async () => {
  const client = createMockSupabaseClient();
  
  // Mancante creatoBy
  const res1 = await consolidazioneStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    checksum: 'chk123'
  });
  assert.strictEqual(res1.data, null);
  assert.match(res1.error.message, /creato_by obbligatorio/);

  // Mancante checksum
  const res2 = await consolidazioneStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    creatoBy: 'op-1'
  });
  assert.strictEqual(res2.data, null);
  assert.match(res2.error.message, /checksum obbligatoria/);
});

// --- Test 6: Off-by-one pagination limits (30 vs 31 rows, 20 vs 21 rows) ---
test('Verifica correttezza formula paginazione (no off-by-one)', async () => {
  const client = createMockSupabaseClient();

  // Aggiungiamo 20 righe IVA acquisti in db
  client.db.registri_iva = [];
  for (let i = 1; i <= 20; i++) {
    client.db.registri_iva.push({
      id: `iva-${i}`,
      societa_id: 'soc-A',
      tipo: 'acquisto',
      imponibile: 10,
      iva: 2.2,
      data: '2026-01-10',
      stampa_iva_id: null
    });
  }

  // Con 20 righe (limite esatto di 1 pagina da 20), la pagina finale deve essere 1
  const res1 = await consolidazioneStampaDefinitiva(client, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    creatoBy: 'op-1',
    checksum: 'chk-limit'
  });
  assert.strictEqual(res1.data.pagina_finale, 1);

  // Ora aggiungiamo 1 riga in più (21 righe totali). Deve passare a pagina 2
  const client2 = createMockSupabaseClient();
  client2.db.registri_iva = [];
  for (let i = 1; i <= 21; i++) {
    client2.db.registri_iva.push({
      id: `iva-${i}`,
      societa_id: 'soc-A',
      tipo: 'acquisto',
      imponibile: 10,
      iva: 2.2,
      data: '2026-01-10',
      stampa_iva_id: null
    });
  }

  const res2 = await consolidazioneStampaDefinitiva(client2, {
    societaId: 'soc-A',
    tipoStampa: 'registro_iva_acquisti',
    annoFiscale: 2026,
    periodoInizio: '2026-01-01',
    periodoFine: '2026-01-31',
    creatoBy: 'op-1',
    checksum: 'chk-limit-2'
  });
  assert.strictEqual(res2.data.pagina_finale, 2);
});
