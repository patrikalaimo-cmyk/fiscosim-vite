# FISCOSIM TEST MATRIX

## Scopo

Questa matrice definisce la baseline automatica ufficiale di FiscoSim. Le suite elencate qui sono eseguibili con `node:test`, non richiedono browser e non devono effettuare scritture su database reale.

| Suite | Comando | Copertura principale | Non copre |
|---|---|---|---|
| Import Contabilità | `npm run test:import` | parser/normalizzazione Import, fixture sintetica TEST-VERGNANO-001, Working View IVA, pruning 0/0, causali IVA standard, storico IVA controparte P2, warning standard/storico, proposta e override manuale detraibilità, storico contabile conto costo/ricavo + causale contabile con override manuale prevalente, payload commit, readiness, dedup/anti-doppio commit, performance 500 documenti, Test Lab con mock | browser reale, Supabase reale, società reali, ZIP cliente reale |
| Core | `npm run test:core` | test Node in `tests/` escluso `testLabIntegrazione.test.js`, che appartiene al profilo Import | E2E browser, DB remoto, migration applicate |
| All safe | `npm run test:all` | unione delle suite Core + Import selezionate dal runner interno | test che richiedano browser o DB reale; tali test non devono essere aggiunti a questo profilo senza isolamento/mocking |
| Build | `npm run build` | compilazione Vite di produzione | comportamento interattivo nel browser |
| CI baseline | GitHub Actions `FiscoSim Test Baseline` | `npm ci`, tre profili test e build su Node 20, Windows + Linux, senza secrets e con download Chromium disabilitato | qualunque integrazione live con Supabase/SDI/Agenzia Entrate |

## Runner ufficiale

`scripts/run-node-tests.mjs` riceve un profilo `import`, `core` o `all`, risolve i file test tramite API Node (`fs/readdir`) e avvia `node --test` con `shell: false`. Non usa glob della shell o Bash e quindi è compatibile con Windows.

Regole:
- `test:import` include tutti i `src/modules/import_contabilita/tests/*.test.js` e `tests/testLabIntegrazione.test.js`.
- `test:core` include gli altri `tests/*.test.js`.
- `test:all` esegue l'unione dei due insiemi.
- Un exit code non zero del Node test runner rende fallita la suite.
- Test futuri che richiedono browser o DB reale devono restare fuori dai profili safe finché non sono isolati con fixture/mock.

## Fixture sintetica Import 25A

La fixture `src/modules/import_contabilita/tests/fixtures/vergnanoSyntheticFixture.js` usa esclusivamente dati fittizi:
- Fornitore: `Fornitore Caffe Test Srl`.
- P.IVA/CF: `99999999999`.
- Documento: `TEST-VERGNANO-001`.
- Acquisto con IVA 22% + 10% e placeholder IVA 0/0 senza natura.
- Causali IVA standard simulate per 22% e 10%.
- Conti e causale contabile esclusivamente test.

La fixture non contiene dati di clienti reali e non effettua accessi a Supabase.

## Test manuali rimasti a fine blocco

Non fanno parte di TEST-BASELINE-1 e non devono essere dichiarati eseguiti automaticamente:
1. apertura reale della Working Table/Working View nel browser e verifica UX della paginazione da 100 righe;
2. import controllato di XML/ZIP di test attraverso il file picker;
3. verifica visiva dell'override manuale e della rigenerazione della bozza;
4. commit su ambiente/società esclusivamente di test con UUID staging reale e verifica della transizione in “Registrate”;
5. prova massiva controllata ~500 documenti per percezione di reattività UI.

## Esclusioni di sicurezza

La baseline non applica migration, non modifica RLS/auth/policy Supabase, non legge `.env` per collegarsi a società reali, non esegue browser automation e non apre la Riconciliazione Bancaria.

## IMPORT-25A-HISTORY-1

Copertura automatica aggiunta:
- indicizzazione storico IVA per P.IVA/denominazione, direzione acquisto/vendita e aliquota;
- causale IVA storica modale con separazione acquisti/vendite;
- percentuale detraibile storica modale;
- P1 standard Studio prevale su P2 storico;
- warning non bloccante quando standard e storico divergono;
- P2 storico usato quando lo standard Studio manca;
- override manuale della percentuale detraibile preservato al rebuild;
- nessun riuso di storico con aliquota incompatibile.

Resta manuale a fine blocco la sola verifica UX nel browser: leggibilità del warning, modifica percentuale detraibile e comportamento visuale al cambio documento.



## IMPORT-25A-HISTORY-2

Copertura automatica aggiunta:
- storico read-only da `documenti_contabilita`, `prima_nota` e `prima_nota_righe`;
- separazione storico acquisti/vendite per controparte;
- match P.IVA prioritario e fallback denominazione normalizzata;
- conto costo/ricavo modale per controparte con esclusione del conto controparte e dei conti IVA;
- causale contabile modale per controparte;
- filtro degli ID non più presenti nel piano conti/causali correnti;
- prefill solo quando il documento non ha già una scelta account/causale;
- marker esplicito “Proposta da storico” nella Working View;
- override manuale/batch/snapshot non sovrascritto dallo storico;
- sorgente storico verificata read-only, senza insert/update/delete.

Resta manuale a fine blocco la verifica UX nel browser: leggibilità del badge storico e sostituzione manuale di conto/causale su un documento reale di test.

## IMPORT-25A-FREEZE

Gate regressivo aggiunto:
- `importContabilitaFreezeAudit.test.js` verifica che il commit sia disabilitato quando la Working View non è coerente;
- verifica il popup `window.confirm` prima della contabilizzazione;
- verifica che la Working Table non chiami direttamente il commit;
- verifica che `runCommitWorkflow` resti concentrato nel handler esplicito della Working View.

Stato: **gate automatico PASS** dopo CI del commit di freeze. La chiusura definitiva resta subordinata alla checklist manuale finale descritta in `REPORT/IMPORT_25A_FREEZE_AUDIT.md`.

## MANUALE-CANONICO-FREEZE — profilo ufficiale

Comando dedicato: `npm run test:manual`.

Il profilo include:
- suite correnti di Registrazione Manuale, policy causali, IVA ordinaria, note credito, split payment, IVA per cassa, reverse/autofattura/CEE, ritenute e partitario;
- suite applicative correnti `canonicalContabilitaDraftMapper`, `fiscalWorkflow`, `registrazioneOperations`, `primaNotaOperations`;
- il test corrente `tests/persistPrimaNotaDraft.test.js`.

Esclusioni nominate:
- `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`;
- `src/modules/contabilita/application/buildContabilitaPostPersistOutput.test.js`.

Le due suite escluse sono fixture di integrazione pre-canoniche rimaste nel repository come storico tecnico. Non sono usate per allentare requisiti: la persistenza corrente è coperta da `tests/persistPrimaNotaDraft.test.js`, mentre mapping/contratto canonico sono coperti dalle suite correnti dedicate.

CI run iniziale del nuovo profilo Manuale: `37613649884`. Ha fatto emergere test storici non più coerenti e regressioni produttive prima non osservate dalla baseline.

