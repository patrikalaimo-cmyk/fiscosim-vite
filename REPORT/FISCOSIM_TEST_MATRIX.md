# FISCOSIM TEST MATRIX

## Scopo

Questa matrice definisce la baseline automatica ufficiale di FiscoSim. Le suite elencate qui sono eseguibili con `node:test`, non richiedono browser e non devono effettuare scritture su database reale.

| Suite | Comando | Copertura principale | Non copre |
|---|---|---|---|
| Import Contabilità | `npm run test:import` | parser/normalizzazione Import, fixture sintetica TEST-VERGNANO-001, Working View IVA, pruning 0/0, causali IVA standard, storico IVA controparte P2, warning standard/storico, proposta e override manuale detraibilità, storico contabile conto costo/ricavo + causale contabile con override manuale prevalente, payload commit, readiness, dedup/anti-doppio commit, performance 500 documenti, Test Lab con mock | browser reale, Supabase reale, società reali, ZIP cliente reale |
| Manuale canonico | `npm run test:manual` | Registrazione Manuale, persistenza canonica, post-persist output, movimenti generali, IVA ordinaria/NC/multi-aliquota, partitario, split, IVA per cassa, reverse/estero, ritenute, cespiti e closed-period guards | browser reale, DB remoto, collaudo UX |
| Consultazione | `npm run test:consultazione` | filtri, stati PN, view model, saldo precedente/progressivo, export, no-write guard e assenza handoff mutativi | browser reale, DB remoto, UX visuale |
| IVA / Registri / Liquidazione | `npm run test:iva` | registri IVA canonici, fatture/NC, multi-aliquota, detraibilità/indetraibilità, split, IVA per cassa, reverse charge, liquidazione provvisoria/definitiva, tenant scope, RPC client, prospetti/export e freeze guard | browser reale, DB remoto, migration applicate |
| Split payment semplice | `npm run test:split` | flag anagrafica, fattura/NC attiva split, conto tecnico configurato, righe PN, partitario al netto IVA, registro e liquidazione | browser reale, DB remoto, casi split avanzati fuori perimetro |
| Ritenute / Scadenzario | `npm run test:ritenute` | parcella professionista, pagamento integrale, chiusura partitario, maturazione ritenuta, debito Erario, scadenza, tenant scope, readiness CU/770 e guard read-only | browser reale, DB remoto, pagamento parziale con ritenuta, controllo F24 importato |
| Stampe/Export (hardening intermedio) | `npm run test:stampe` | modelli registro/giornale, guard no facsimile operativo, scoping arricchimenti, blocco export potenzialmente tronco, print HTML provvisorio, precheck consolidamento | fascicolo unico, volumi >1000, hash contenuto definitivo, browser/PDF E2E |
| Riconciliazione Bancaria (gate sviluppo) | `npm run test:bank` | validatore canonico ignored e blocker, fixture R8/R9A, dry-run/replay, guard nessun commit reale | RPC atomica, DB reale, UI E2E e contabilizzazione reale |
| Core | `npm run test:core` | test Node in `tests/` escluso `testLabIntegrazione.test.js`, che appartiene al profilo Import | E2E browser, DB remoto, migration applicate |
| All safe | `npm run test:all` | unione delle suite Core + Import selezionate dal runner interno | test che richiedano browser o DB reale; tali test non devono essere aggiunti a questo profilo senza isolamento/mocking |
| Build | `npm run build` | compilazione Vite di produzione | comportamento interattivo nel browser |
| CI baseline | GitHub Actions `FiscoSim Test Baseline` | `npm ci`, sei profili test e build su Node 20, Windows + Linux, senza secrets e con download Chromium disabilitato | qualunque integrazione live con Supabase/SDI/Agenzia Entrate |

## Runner ufficiale

`scripts/run-node-tests.mjs` riceve un profilo `import`, `manual`, `consultazione`, `iva`, `split`, `ritenute`, `stampe`, `bank`, `core` o `all`, risolve i file test tramite API Node (`fs/readdir`) e avvia `node --test` con `shell: false`. Non usa glob della shell o Bash e quindi è compatibile con Windows.

Regole:
- `test:import` include tutti i `src/modules/import_contabilita/tests/*.test.js` e `tests/testLabIntegrazione.test.js`.
- `test:manual` include le suite Manuale root selezionate e ricorsivamente le suite application pertinenti, comprese `persistPrimaNotaDraft.test.js` e `buildContabilitaPostPersistOutput.test.js`.
- `test:consultazione` include le suite root Consultazione selezionate e le suite application `consultazioneOperations` / `primaNotaOperations` pertinenti.
- `test:iva` include 15 suite dedicate a registri IVA, liquidazione, split/cassa/reverse, detraibilità, export e guard di freeze.
- `test:split` include 3 suite dedicate a configurazione anagrafica, documento split e impatto in liquidazione.
- `test:ritenute` include 4 suite dedicate a ciclo parcella/pagamento, scadenzario, percipiente, readiness CU/770 e guard architetturale.
- `test:stampe` include le suite mirate ai modelli stampa, al motore di consolidamento, al checksum UI e al guard di sicurezza Stampe.
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


## SPLIT-SIMPLE-FREEZE

Profilo dedicato: `npm run test:split`.

Gate codice validato: GitHub Actions run `37695652369`.
- `test:split`: **3 file / 25 test PASS** su Ubuntu e Windows;
- Import, Manuale, Consultazione, IVA, Core e All safe: PASS;
- build Vite: PASS su Ubuntu e Windows.

Il gate copre:
- flag split salvato/riletto sull'anagrafica;
- attivazione solo sul documento attivo compatibile;
- conto IVA split configurato e blocker se mancante;
- controparte cliente ridotta all'imponibile;
- righe tecniche split quadrate;
- nota credito attiva split con controparte mantenuta sul lato Avere;
- partitario al solo importo incassabile;
- propagazione del flag nel payload IVA/canonico;
- esclusione dell'IVA split dal debito effettivo di liquidazione.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.


## RITENUTE-SCADENZARIO-FREEZE

Profilo dedicato: `npm run test:ritenute`.

Gate codice validato: GitHub Actions run `37697140035`.
- `test:ritenute`: **4 file / 27 test PASS** su Ubuntu e Windows;
- Import, Manuale, Consultazione, IVA, Split, Core e All safe: PASS;
- build Vite: PASS su Ubuntu e Windows.

Il gate copre:
- parcella professionista e predisposizione ritenuta;
- maturazione fiscale solo al pagamento;
- pagamento integrale con corretta scrittura PN;
- chiusura partitario;
- aggiornamento della posizione ritenuta senza duplicazione;
- debito Erario, codice tributo e scadenza;
- rollover dicembre -> 16 gennaio anno successivo;
- query operative tenant-scoped;
- CU/770 non pronto senza codice fiscale;
- aliquota ritenuta solo da dati esplicitamente configurati;
- vista Ritenute in sola lettura, senza percorso alternativo di write.

Limite noto non coperto: **pagamento parziale con ritenuta**, oggi esplicitamente bloccato. Non è considerato supportato dal freeze e resta requisito residuo prima della Release A100 salvo esclusione formale.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.


## STAMPE-EXPORT-FASCICOLO — gate parziale, NON FREEZE

Profilo dedicato `npm run test:stampe`. Il gate automatico del commit di hardening non certifica la completezza del blocco.

Copertura iniziale:
- schermata Stampe non può esporre fac-simile come dati reali;
- registri IVA e libro giornale da modelli esistenti;
- arricchimenti dei registri per società e fallimento esplicito se manca una relazione;
- blocco degli export che potrebbero essere troncati a 1000 righe;
- HTML provvisorio senza numero pagine fittizio;
- motore di precheck e consolidamento da test precedenti.

Ancora da implementare/testare prima del freeze:
- paginazione completa dati grandi;
- report canonici Partitari/Mastrini/Bilancio;
- PDF unico del fascicolo;
- checksum legato ai contenuti effettivi;
- QA browser reale e PDF esportato.

Stato: **IN CORSO — NON CONGELATO**.


## BANK-DEV — autorizzazione 2026-10-08

Sviluppo Bank sbloccato parallelamente a Stampe. Test `npm run test:bank` su fixture sintetiche:
- contesto obbligatorio e blocker non ignorabili nel caso `ignored`;
- `ignored` non può contenere PN, righe PN, partitario, IVA per cassa o ritenute;
- fixture mapper canonico R8 (16 casi) e commit R9A dry_run/replay (16 casi);
- commit reale ancora impedito lato applicazione.

Non dichiarare Bank pronto alla produzione sulla base del solo `test:bank`: RPC, vincoli idempotenza database, audit e collaudi sono ancora requisiti aperti.


## Stampe — paginazione oltre 1000 righe

Nuovo `tests/stampePagination.test.js` nel profilo `test:stampe`: test con 1234 righe, multiplo esatto del pageSize, pagina fallita, ID duplicato/mancante, stop limite pagine, batch di join e guard sul repository.

I test automatici non certificano da soli consistenza sotto scritture concorrenti, rendering PDF o definitività del fascicolo.


## Checkpoint CI 2026-10-08

- Bank: `test:bank` 7/7 PASS su entrambi i sistemi; CI `37701343937`.
- Stampe: `test:stampe` 44/44 PASS su entrambi i sistemi; CI `37701699556`.
- All safe e build: PASS Ubuntu/Windows.
- Questi gate non certificano operatività bancaria in produzione né fascicolo cliente PDF completo.


## Checkpoint automatico 2026-10-08 — Bank/CSV/Mastri

Gate:
- Bank `ad773a5`, run `37737965871`: **PASS** Ubuntu/Windows.
- CSV Stampe `d0bb3ed`, run `37738239233`: **PASS** Ubuntu/Windows.
- Modello movimenti per conto `5524709`, run `37738561308`: **PASS** Ubuntu/Windows.

Copertura integrativa Bank:
- sourceDocumentId del commit riferito al singolo movimento e non all'estratto conto;
- obbligo movementId/decisionId e coerenza società/esercizio/conto banca tra contesto e payload;
- righe PN solo nelle sezioni Dare/Avere.

Copertura integrativa Stampe:
- protezione da interpretazione come formula delle celle CSV in Registro IVA e Giornale;
- modello deterministico per conto da PN canonica, saldi di movimentazione del periodo in centesimi, quadra Dare/Avere e blocca PN incoerenti, doppie, di altra società o prive di conto;
- esclusione esplicita di bozze e simulazioni;
- il modello resta **non definitivo** e non prova i saldi d'apertura; non è collegato alla UI.

Questi gate **non** attestano PDF fascicolo, registri definitivi basati su hash di contenuto, verifica saldi iniziali, Bank commit atomico o collaudo browser/DB reale.


## STAMPE — Saldi intraesercizio da PN (sottofase P1, 2026-10-08)

Aggiunto `tests/stampeSaldiPerContoEsercizioModel.test.js` al profilo `test:stampe`: verifiche con fixture di prima nota e piano dei conti sintetici per saldi precedenti, progressivi, nota credito, classificazioni, conti senza movimenti, esclusione storno/stornata, isolamento tenant, confine esercizi, date impossibili, duplicati, conti non foglia e schema classificazione incoerente.

Verifica di dominio **non** equivalente a test con banca dati, riapertura precedente esercizio, caricamento paginato o stampa definitiva. Risultati CI da verificare dopo commit.


## Checkpoint CI saldo precedente intraesercizio — 2026-10-08

Commit `1ec940c`: GitHub Actions `37766190172` SUCCESS su Ubuntu/Windows. Ogni piattaforma: Stampe 61/61; Bank 11/11; Core 629/629; All safe 1004/1004; build PASS. Esclusi dal gate saldi riportati dal precedente esercizio, snapshot e collaudi browser/database/PDF.

## STAMPE — audit raccordo apertura/chiusura (2026-10-08)

Nuovo profilo `stampeRaccordoEserciziModel.test.js`: fixture due esercizi, scrittura economica e suo azzeramento, chiusura patrimoniale e riapertura opposta, mismatch centesimi, stato e tenant, causali ID/tipo, date/anno, chiusure duplicate/omesse, conti economici indebitamente movimentati, `saldo_iniziale` ignorato e dataset incoerente. In `stampeSaldiPerContoEsercizioModel.test.js` nuovo scenario cronologico con conto associato alternativamente via codice e ID. Gate CI pendente.
Non si tratta di collaudo di chiusura automatica, RLS, database, concorrenza, export o PDF.
