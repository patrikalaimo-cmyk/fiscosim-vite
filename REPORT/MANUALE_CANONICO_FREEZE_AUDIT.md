# MANUALE-CANONICO-FREEZE — AUDIT AUTOMATICO

Data: 2026-10-07  
Branch: `mio-branch`  
Commit codice validato: `1cbcfbbd7c896650df2ab9fc7ee3c57fc22cd990`  
CI ufficiale: run `37662134584`

## Esito

**AUTOMATICO VERDE / MANUALE PENDENTE**

Ubuntu e Windows verdi su:
1. `npm run test:import`;
2. `npm run test:manual`;
3. `npm run test:core`;
4. `npm run test:all`;
5. `npm run build`.

Conteggi Ubuntu del run ufficiale:
- Import: 19 file, 231/231 test PASS;
- Manuale: 29 file, 413/413 test PASS;
- Core: 57 file, 574/574 test PASS;
- All safe: 83 file, 942/942 test PASS;
- build Vite: PASS.

## Audit architetturale reale

Percorso di scrittura confermato:
`RegistrazioneManualeView.jsx`
→ `buildRegistrazioneDraft`
→ `mapRegistrazioneManualeToCanonical` / validazione canonica
→ `persistPrimaNotaDraft`
→ persistenza condivisa.

Esiti:
- la view non esegue write diretti su `prima_nota`, `prima_nota_righe`, `registri_iva`, `partitario` o `ritenute_dacconto`;
- l'unico `.from(...)` contabile individuato nella view è una lettura di `utenti_studio`;
- il post-save cespite è stato spostato nell'application service `application/cespiti/createCespiteFromPrimaNota.js`; l'eventuale write su `beni_ammortizzabili` resta accessorio e non costituisce un secondo percorso contabile;
- `persistPrimaNotaDraft` risolve la causale configurata, costruisce/valida il payload canonico e usa il percorso di persistenza condiviso;
- nessun secondo dialetto contabile è stato introdotto.

## Baseline Manuale ufficiale

`npm run test:manual` usa il runner Node ricorsivo Windows-safe, senza glob shell e con `spawn(..., shell:false)`.

Sono incluse esplicitamente le suite application richieste:
- `registrazioneOperations/registrazioneOperations.test.js`;
- `persistPrimaNotaDraft.test.js`;
- `canonicalContabilitaDraftMapper.test.js`;
- `buildContabilitaPostPersistOutput.test.js`;
- `primaNotaOperations/primaNotaOperations.test.js`;
- `fiscalWorkflow.test.js`;
- suite cespiti application pertinenti.

Sono incluse inoltre le suite root pertinenti a movimenti generali, IVA ordinaria, note credito, multi-aliquota, partitario, split payment, IVA per cassa, reverse/autofatture/estero, ritenute, closed-period guards, cespiti, registri IVA e mutation service.

## Casi obbligatori coperti automaticamente

- movimento generale/giroconto senza IVA o soggetto quando non richiesti;
- fattura passiva ordinaria: PN + registro acquisti + partita fornitore;
- fattura attiva ordinaria: PN + registro vendite + partita cliente;
- note credito attive/passive: stesso registro, segno opposto e partitario negativo/opposto;
- multi-aliquota senza collassamento improprio;
- split payment semplice con netto partitario e conti tecnici condivisi;
- IVA per cassa: documento differito e rilascio su incasso/pagamento;
- reverse charge/autofatture/estero: doppia annotazione dove prevista e neutralità IVA;
- parcelle professionisti: ritenute/cassa e maturazione della ritenuta al pagamento;
- partitario: apertura/chiusura, incassi/pagamenti e segni NC;
- modifica/storno e guardie di periodo chiuso/stampato.

## Failure emersi dopo la reinclusione delle suite application

La reinclusione delle due suite application precedentemente escluse ha fatto emergere 5 failure. Il triage ha classificato tutti e 5 come **fixture/test obsoleti**, non bug produttivi:
1. fixture basate sull'adapter Import senza i campi correnti del draft Manuale;
2. mock DB non aggiornato alla lettura read-only di `causali_contabili`;
3. aspettativa obsoleta `numero_documento → numero_registrazione`;
4. aspettativa obsoleta sul guard UUID di `documento_import_id`.

Le fixture sono state riallineate al contratto corrente senza rimuovere suite e senza allentare validatori o guardie.

## Vincoli rispettati

- nessuna migration Supabase applicata;
- nessuna modifica a `.env`, `.env.local`, `.env.example`;
- nessuna modifica auth/login/RLS/policy;
- nessuna scrittura su società reali;
- nessun test browser/manuale dichiarato eseguito;
- ref aggiornata sempre fast-forward con `force:false` e controllo `expected_sha`.

## Debito manuale

La checklist completa è mantenuta in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## Gate successivo

`CONSULTAZIONE-FREEZE`.

La Riconciliazione Bancaria resta bloccata secondo il gate stabilito.
