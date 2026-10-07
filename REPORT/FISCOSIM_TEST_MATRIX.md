# FISCOSIM TEST MATRIX

## Scopo

Questa matrice definisce la baseline automatica ufficiale di FiscoSim. Le suite elencate qui sono eseguibili con `node:test`, non richiedono browser e non devono effettuare scritture su database reale.

| Suite | Comando | Copertura principale | Non copre |
|---|---|---|---|
| Import Contabilità | `npm run test:import` | parser/normalizzazione Import, fixture sintetica TEST-VERGNANO-001, Working View IVA, pruning 0/0, causali IVA standard, storico IVA controparte P2, warning standard/storico, proposta e override manuale detraibilità, storico contabile conto costo/ricavo + causale contabile con override manuale prevalente, payload commit, readiness, dedup/anti-doppio commit, performance 500 documenti, Test Lab con mock | browser reale, Supabase reale, società reali, ZIP cliente reale |
| Manuale canonico | `npm run test:manual` | Registrazione Manuale, persistenza canonica, post-persist output, movimenti generali, IVA ordinaria/NC/multi-aliquota, partitario, split, IVA per cassa, reverse/estero, ritenute, cespiti e closed-period guards | browser reale, DB remoto, collaudo UX |
| Consultazione | `npm run test:consultazione` | filtri, stati PN, view model, saldo precedente/progressivo, export, no-write guard e assenza handoff mutativi | browser reale, DB remoto, UX visuale |
| IVA / Registri / Liquidazione | `npm run test:iva` | registri IVA canonici, fatture/NC, multi-aliquota, detraibilità/indetraibilità, split, IVA per cassa, reverse charge, liquidazione provvisoria/definitiva, tenant scope, RPC client, prospetti/export e freeze guard | browser reale, DB remoto, migration applicate |
| Core | `npm run test:core` | test Node in `tests/` escluso `testLabIntegrazione.test.js`, che appartiene al profilo Import | E2E browser, DB remoto, migration applicate |
| All safe | `npm run test:all` | unione delle suite Core + Import selezionate dal runner interno | test che richiedano browser o DB reale; tali test non devono essere aggiunti a questo profilo senza isolamento/mocking |
| Build | `npm run build` | compilazione Vite di produzione | comportamento interattivo nel browser |
| CI baseline | GitHub Actions `FiscoSim Test Baseline` | `npm ci`, sei profili test e build su Node 20, Windows + Linux, senza secrets e con download Chromium disabilitato | qualunque integrazione live con Supabase/SDI/Agenzia Entrate |

## Runner ufficiale

`scripts/run-node-tests.mjs` riceve un profilo `import`, `manual`, `consultazione`, `iva`, `core` o `all`, risolve i file test tramite API Node (`fs/readdir`) e avvia `node --test` con `shell: false`. Non usa glob della shell o Bash e quindi è compatibile con Windows.

Regole:
- `test:import` include tutti i `src/modules/import_contabilita/tests/*.test.js` e `tests/testLabIntegrazione.test.js`.
- `test:manual` include le suite Manuale root selezionate e ricorsivamente le suite application pertinenti, comprese `persistPrimaNotaDraft.test.js` e `buildContabilitaPostPersistOutput.test.js`.
- `test:consultazione` include le suite root Consultazione selezionate e le suite application `consultazioneOperations` / `primaNotaOperations` pertinenti.
- `test:iva` include 15 suite dedicate a registri IVA, liquidazione, split/cassa/reverse, detraibilità, export e guard di freeze.
- `test:core` include gli altri `tests/*.test.js`.
- `test:all` esegue l'unione dei profili safe senza dipendere da glob shell.
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

Il profilo include 29 file nel gate validato e comprende esplicitamente:
- `canonicalContabilitaDraftMapper.test.js`;
- `persistPrimaNotaDraft.test.js` application;
- `buildContabilitaPostPersistOutput.test.js`;
- `fiscalWorkflow.test.js`;
- `registrazioneOperations/registrazioneOperations.test.js`;
- `primaNotaOperations/primaNotaOperations.test.js`;
- suite application cespiti pertinenti;
- test root di Registrazione Manuale, policy causali, IVA ordinaria/NC/multi-aliquota, partitario, split payment, IVA per cassa, reverse/autofattura/estero, ritenute, closed-period guards, cespiti, registri IVA e mutation service.

Le due suite application in precedenza escluse sono state reincluse. Le relative fixture storiche sono state riallineate al contratto Manuale corrente senza indebolire validazioni o guardie.

Gate validato: GitHub Actions run `37662134584`.
- `test:manual`: **413/413 PASS** su Ubuntu; stesso step PASS su Windows.
- `test:import`: PASS.
- `test:core`: PASS.
- `test:all`: PASS.
- `npm run build`: PASS.
- matrice CI: Ubuntu + Windows.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.


## CONSULTAZIONE-FREEZE

Profilo dedicato: `npm run test:consultazione`.

Gate validato: GitHub Actions run `37664771687`.
- 5 file / 38 test PASS;
- Ubuntu + Windows PASS;
- Core 575/575 PASS;
- All safe 950/950 PASS;
- build PASS.

Il guard read-only copre View, componenti Consultazione e application operations. Sono vietati callback mutativi, RPC di write e write diretti sulle tabelle contabili principali.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.


## IVA-REGISTRI-LIQUIDAZIONE-FREEZE

Profilo dedicato: `npm run test:iva`.

Gate codice validato: GitHub Actions run `37680695367`.
- `test:iva`: **15 file / 148 test PASS** su Ubuntu e Windows;
- Import: **231/231 PASS**;
- Manuale: **413/413 PASS**;
- Consultazione: **38/38 PASS**;
- Core: **584/584 PASS**;
- All safe: **959/959 PASS**;
- build Vite: PASS su Ubuntu e Windows.

Il gate copre anche le regressioni introdotte dal freeze:
- `iva_detraibile = 0` preservato come zero, senza fallback alla piena IVA;
- split payment letto dal campo dominio `ivaSplitEsclusa`;
- nessun conteggio registri o operatore dimostrativo hardcoded;
- query registri e snapshot consolidate tenant-scoped;
- vista Tax Compliance agganciata al percorso IVA canonico sottoposto a freeze.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
