# 14_SOCIETA_DEMO_TEST_LAB — FASE 24A

## Obiettivo
Creare **solo** il recinto di sicurezza per società demo/Test Lab reale. Il Test Lab userà in futuro il motore reale FiscoSim (Import + Manuale + persistenza canonica), ma in 24A **nessun ciclo contabile deve partire**.

## Rischio fase
**ALTO** — rischio contaminazione società reali se il criterio demo è debole o se la UI consente write prima del recinto.

## Regole sicurezza
1. Criterio DEMO **esplicito**: codice società con prefisso `__TEST__` o `test_` (case-insensitive). **Nessuna** euristica su denominazione/ragione sociale.
2. Guardia `assertDemoCompanyForTestLab` obbligatoria prima di qualsiasi operazione Test Lab futura.
3. UI 24A: banner demo, scenari visibili ma **disabilitati**.
4. Vietato in 24A: fatture, import, commit, persistPrimaNotaDraft, delete, cleanup, migration, env/auth/RLS.

## Criterio demo trovato
**SÌ — sicuro a livello applicativo** (prefisso `codice` esplicito).

| Campo DB | Uso |
|---|---|
| `societa.codice` | Criterio primario DEMO (`__TEST__*` / `test_*`) |
| `societa.denominazione` | Solo visualizzazione — **non** usato per qualificazione |
| `societa.note` / `metadata` | Non presenti come flag demo strutturato — gap futuro opzionale (richiederebbe migration, vietata in 24A) |

**Gap residuo**: senza colonna DB dedicata (`is_demo`), la sicurezza dipende dalla disciplina operativa nella creazione società (codice prefissato). Accettabile per 24A.

## Cosa è vietato (24A)
- Generare fatture da UI Test Lab
- Import file / `runImportWorkflow`
- Contabilizzare / `runCommitWorkflow` / `persistPrimaNotaDraft`
- Pulizia dati / delete
- Scenari massivi operativi
- Migration, env, auth, RLS
- Mock o bypass login
- Completamento cespiti / ammortamenti automatici
- Sblocco Riconciliazione bancaria

## Cosa è consentito (24A)
- Helper `isDemoCompany` / `assertDemoCompanyForTestLab`
- UI minima con banner e blocco società non demo
- Elenco scenari **solo visivo**, disabilitato
- Generatori XML in codice (non invocabili da UI) per test unitari su società demo
- Documentazione e test sicurezza

## Cosa sarà 24B / 24C
| Fase | Contenuto |
|---|---|
| **24B** | Prepara test: generazione XML, `runImportWorkflow`, working table in-memory, tag `[TEST_LAB]` |
| **24C** | Ciclo completo commit reale su società demo, report bilanciamento, pulizia selettiva |

## Punti write reali intercettati (audit)
| Modulo | Punto write | Stato 24A |
|---|---|---|
| Import Contabilità | `runCommitWorkflow` → `persistPrimaNotaDraft` | Non raggiungibile da Test Lab UI |
| Registrazione Manuale | `RegistrazioneManualeView` save / commit | Non collegato a Test Lab |
| Test Mode legacy | `EXECUTORS` T01–T26 (insert/delete clienti, PN test) | Perimetro separato — fuori Test Lab 24A |
| Cespiti leggeri | insert `beni_ammortizzabili` post-commit | Non attivabile da Test Lab 24A |

## Anti-contaminazione società reale
- Blocco UI se `!isDemoCompany(currentSocieta)`
- Rimozione criterio debole `denominazione.includes('test')`
- Futuro: tag tracciamento `[TEST_LAB]` + prefisso file `test_lab_` (24B)

## Pulizia dati futura (24C)
Selettiva per società demo + marker:
- `documenti_import.filename` LIKE `test_lab_%`
- `prima_nota.descrizione` LIKE `%[TEST_LAB]%`
- `documenti_contabilita.note_operatore = '[TEST_LAB]'`
- **Non implementata in 24A** (vietato delete)

## Struttura società (audit codice)
Tabella `societa`: `id`, `codice` (UNIQUE), `denominazione`, `codice_fiscale`, `partita_iva`, `regime_contabile`, `attiva`, `note`, timestamps. Nessun flag `is_demo` nativo.

## Ruoli Admin/Owner
Tabella `utenti_studio.ruolo`: `owner`, `admin`, `collaboratore`. Test Lab non restringe per ruolo in 24A — il recinto è per società demo.

## Cambio società attiva
- `src/modules/test_mode/index.jsx` — select società Test Mode
- Moduli contabilità — prop `societaAttiva` da shell principale
- `src/modules/ai_agent/index.jsx` — select dedicato

## Riconciliazione bancaria
**BLOCCATA** — gate Manuale + Import non superato finché Test Lab e matrice test manuale non validati.

## Cespiti
Fase 16 = **aggancio leggero/parziale** (intercettazione conto + bozza `beni_ammortizzabili`). Libro cespiti completo e ammortamenti automatici = **futuro**.

## Test richiesti
- `tests/testLabIntegrazione.test.js` — sicurezza 24A
- Suite regressione contabilità/import invariata
- `npm run build`

## FASE 24B — Fattura ordinaria acquisto 10 casi / Prepara test

### Cosa viene creato
- 10 file XML sintattici (`test_lab_acq_01` … `test_lab_acq_10`) con metadati `caseId`, `source: test_lab`, marker `[TEST_LAB]`.
- Staging rows via motore reale `runImportWorkflow` (parsing FatturaPA identico a Import Contabilità).
- Snapshot in `sessionStorage` chiave `import_contabilita.last_result.{societaId}` con `automationMetaByRowId` per tracciamento test.

### Dove viene scritto
- **Solo sessionStorage** (working table locale Import Contabilità) — **nessun** insert su `documenti_import` (`saveBatch` non implementato / vietato in 24B).
- **Nessuna** scrittura su `prima_nota`, `registri_iva`, `partitario`, `documenti_contabilita`, `beni_ammortizzabili`.

### Tracciamento test_lab
- Prefisso filename: `test_lab_`
- `automationMetaByRowId[rowId].source = 'test_lab'`
- `automationMetaByRowId[rowId].scenario = 'ordinarie_acquisto_24b'`
- `automationMetaByRowId[rowId].caseId = acq_01..10`
- Descrizione XML contiene `[TEST_LAB]`

### Cosa NON viene creato
- Prime note, registri IVA, partitario, ritenute, cespiti, record DB staging persistenti, contabilizzazioni.

### Perché non parte la contabilizzazione
- `runCommitWorkflow` e `persistPrimaNotaDraft` **non sono invocati**.
- `TEST_LAB_PHASE_24B.allowCommit = false` — pulsante "Esegui ciclo completo" disabilitato.

### 10 casi
| caseId | Caso |
|--------|------|
| acq_01 | Monoriga IVA 22% |
| acq_02 | Monoriga IVA 10% |
| acq_03 | Monoriga IVA 4% |
| acq_04 | Multi-riga stesso conto costo |
| acq_05 | Due conti costo diversi |
| acq_06 | Multi-aliquota 4/10/22 |
| acq_07 | Fattura con bollo |
| acq_08 | Arrotondamento centesimale |
| acq_09 | Fornitore già esistente |
| acq_10 | Fornitore nuovo da verificare |

### Test automatici
- `tests/testLabIntegrazione.test.js` — 15 test sicurezza + prepare workflow.

### Test manuali richiesti
1. Selezionare società demo (`__TEST__*` / `test_*`) in Test Mode.
2. Cliccare "Prepara test — Fattura ordinaria acquisto".
3. Verificare report verde, 10 casi preparati, contabilizzati = 0.
4. Aprire Import Contabilità sulla stessa società demo — working table con 10 righe.
5. Verificare che "Contabilizza" non sia stato invocato dal Test Lab.

### Rischi residui
- Snapshot solo sessionStorage: si perde al refresh tab se non si riapre Import.
- `documenti_import` DB non popolato — dedup cross-session non vede i test fino a 24C/eventuale staging DB tracciato.
- Fornitore "esistente" (acq_09) richiede P.IVA presente in anagrafica reale della società demo per match completo in Import.

### File implementazione 24B
- `src/modules/test_mode/testLabOrdinariaAcquistoCases.js`
- `src/modules/test_mode/testLabPreparaWorkflow.js`
- `src/modules/test_mode/TestLabPanel.jsx` (UI Prepara test)
- `src/modules/test_mode/demoCompanyGuard.js` (`TEST_LAB_PHASE_24B`)

## FASE 24B-FIX — Società demo sicura Test Lab

### Problema risolto
Nessuna società con codice `__TEST__*` / `test_*` in DB → Test Lab non utilizzabile manualmente.

### Soluzione
- Pulsante **Admin/Owner** nel Test Lab: `Crea società demo FiscoSim`
- Codice fisso: `__TEST__FISCOSIM_DEMO`
- Denominazione: `FiscoSim Demo Test Lab SRL`
- Idempotente: se esiste → aggancia/seleziona, non duplica
- Dopo creazione/aggancio compare nella tendina società (Test Mode + Contabilità, reload `societa` attive)
- **Nessun test automatico** dopo creazione — scenario 24B resta manuale

### Cosa viene creato
- **Un solo record** `societa` con codice `__TEST__FISCOSIM_DEMO` e nota `[TEST_LAB]`

### Cosa NON viene creato
- Fatture, prime note, registri IVA, partitario, cespiti, pulizia dati

### Sicurezza
- Bloccato per ruoli diversi da `owner` / `admin`
- Banner `SOCIETÀ DEMO — DATI DI TEST` quando selezionata
- Nessuna migration / env / RLS / policy modificati

### File
- `src/modules/test_mode/demoCompanyProvision.js`
- `src/modules/test_mode/societaTestLabSchema.js` (schema live + select allineate)
- `src/modules/test_mode/TestLabPanel.jsx` (pulsante creazione)
- `src/modules/test_mode/index.jsx` (reload tendina + selezione demo)

## FASE 24B-FIX-2 — Schema alignment società demo

### Causa errore UI
`column societa.ragione_sociale does not exist` — insert/select Test Lab usavano colonna assente nel DB live.

### Schema reale `societa` (introspezione DB live)
`id`, `codice`, `denominazione`, `codice_fiscale`, `partita_iva`, `indirizzo`, `cap`, `citta`, `provincia`, `regime_contabile`, `esercizio_da`, `esercizio_a`, `attiva`, `note`, `created_at`, `updated_at`, `ai_enabled`, `tipo_liquidazione_iva`, `email`, `pec`, `telefono`, `attivo`

**Assente:** `ragione_sociale` (presente solo in migration bootstrap locale, non in produzione).

### Campi insert demo
`codice`, `denominazione`, `partita_iva`, `codice_fiscale`, `regime_contabile`, `attiva`, `note`

### Select Test Lab
- Lista tendina: `SOCIETA_TEST_LAB_LIST_SELECT`
- Provisioning: `SOCIETA_TEST_LAB_PROVISION_SELECT`

### Guardia demo
Invariata: solo prefisso `societa.codice` `__TEST__` / `test_`

### Rischi residui fuori perimetro
Altri moduli (Import Contabilità workflow, Registrazione Manuale) referenziano ancora `societa.ragione_sociale` — da allineare in task dedicato, non in 24B-FIX-2.

## FASE 24B-FIX-3 — Seed contabile minimo società demo

### Problema risolto
Società demo esistente ma **piano dei conti e causali vuoti** → working table Import incompleta (dropdown senza opzioni valide).

### Soluzione
- Funzione idempotente `ensureTestLabDemoAccountingSetup` — solo società demo (`__TEST__*` / `test_*`), solo Admin/Owner.
- Pulsante Test Lab: **Prepara dati contabili demo** (esplicito, non avvia test fatture).
- Report esito: conti/causali/causali IVA creati vs già esistenti.

### Schema reale rilevato (introspezione DB live)
- **`piano_conti`**: codice con spazi (`6 01 001`), colonne `codice_mastro`, `codice_conto`, `codice_sottoconto`, `livello`, `tipo`, `natura`, `sezione`, `is_fornitore`, `is_iva`, `attivo`, …
- **`causali_contabili`**: `attivo` (non `attiva`), `tipo_causale`, `codice_registro_iva`, `operazione_partite`, `documento_direzione`, `righe_prima_nota_template`
- **`causali_iva`**: `codice`, `descrizione`, `aliquota`, `detraibile`, `percentuale_detraibilita`, `attivo`, `societa_id`

### Dati contabili demo creati/agganciati (set minimo)
| Tipo | Quantità | Dettaglio |
|------|----------|-----------|
| Piano conti | 7 | `6 01 001`, `6 02 001`, `6 03 001`, `6 05 001`, `1 02 40 0001` (IVA credito), `2 04 02 0001` (fornitore), `6 99 001` (arrotondamenti) |
| Causale contabile | 1 | `FF` — Doc. IVA normale, registro acquisti `01`, partitario Apre |
| Causali IVA | 3 | `TESTLAB22` 22%, `TESTLAB10` 10%, `TESTLAB04` 4% |

Marker: `[TEST_LAB]` su descrizioni/note. Nessuna clonazione da società reali.

### Idempotenza
Seconda esecuzione: `created=0`, `existing` = totale seed — nessun duplicato.

### Cosa NON viene creato
- Fatture, prime note, movimenti registro IVA, partitario, contabilizzazione, pulizia dati, delete.

### File
- `src/modules/test_mode/testLabAccountingSchema.js` — definizioni seed + mapping colonne reali
- `src/modules/test_mode/testLabDemoAccountingSeed.js` — `ensureTestLabDemoAccountingSetup`
- `src/modules/test_mode/TestLabPanel.jsx` — pulsante + `AccountingSeedReportPanel`

### Test automatici (24B-FIX-3)
- Seed bloccato su società reale
- Seed abilitato solo demo
- Idempotenza
- Causale FF + IVA 22/10/4
- Nessun commit/persist/delete nel modulo seed
- `tests/testLabIntegrazione.test.js` — 32 test totali

### Test manuali richiesti
1. Selezionare società demo → **Prepara dati contabili demo** → report verde/giallo.
2. **Prepara test — Fattura ordinaria acquisto** (10 casi).
3. Aprire Import Contabilità: dropdown conto, causale `FF`, causali IVA popolati.

### Prossimo step
Validazione manuale Import su società demo post-seed, poi 24C (ciclo completo — ancora disabilitato).

## FASE 24B-FIX-4 — Allineamento Dropdown Import con Seed Contabile Demo
- **Seed contabile demo** verificato ed eseguito correttamente nel database reale tramite script di setup diagnostico.
- **Dropdown Conto proposto / Causale contabile** allineati, caricando dinamicamente i record associati alla società demo in `Import Contabilità`.

## FASE 24B-FIX-5 — Conferma Singola Anagrafica Import / Test Lab
- **Obiettivo**: Permettere all'operatore di confermare una singola anagrafica/controparte nella sezione "Anagrafiche da verificare".
- **Soluzione**: Aggiunta una colonna "Conferma" nella tabella anagrafiche. Se la riga è pronta (validation status is `ready`, `linked`, or `ignored`), viene mostrato un pulsante "Conferma".
- **Logica**: Per le azioni `"Crea nuovo conto"`, il pulsante crea il conto reale in `piano_conti` tramite `createImportContabilitaPianoConto`, calcolandone il codice progressivo e ricaricando il piano dei conti locale. Per `"Seleziona esistente"`, associa l'anagrafica esistente. Per `"Ignora"`, la esclude.
- **Feedback**: Banners di successo riportano la denominazione confermata, il conto generato/collegato, e il numero di documenti aggiornati localmente.
- **File coinvolti**:
  - `src/modules/import_contabilita/index.jsx` (onConfirmSingleAnagrafica)
  - `src/modules/import_contabilita/components/ImportContabilitaAnagraficheDetail.jsx` (porting del bottone nella tabella UI)

## FASE 24C — Test Lab Ciclo Completo Controllato su una sola Fattura Demo
- **Obiettivo**: Abilitare il ciclo completo controllato SOLO per una riga selezionata in società demo.
- **Implementazione**:
  - `Test Lab` configurato su **Fase 24C**.
  - `onStartAccounting` in `index.jsx` blocca la contabilizzazione se non è selezionata esattamente una riga pronta.
  - Se selezionata, mostra un popup di conferma riepilogando numero documento, fornitore, imponibile, IVA, totale, conto e causale contabile.
  - Esegue il commit reale (tramite `runCommitWorkflow` -> `persistPrimaNotaDraft`).
  - Al termine, restituisce un report esito dettagliato (`window.alert`) indicando il documento selezionato/contabilizzato, lo stato della riga in staging, l'ID della Prima Nota, il numero di righe Prima Nota create, le righe Registro IVA, lo scadenziario partitario e che le rimanenti 9 righe non selezionate in staging sono escluse.
- **Sicurezza**: Blocco assoluto della modalità 24C su società non-demo (usano il flusso standard). Riconciliazione bancaria resta bloccata.


## FASE 24D — Riaggancio Working Area Import su Società Demo

### Problema risolto
24C tentava commit diretto (`runCommitWorkflow` → `persistPrimaNotaDraft`) in `onStartAccounting`, saltando la working area/predisposizione contabile già esistente. Il payload assemblato inline era incompleto e non passava la validazione canonica.

### Working area storica trovata: SÌ
| Componente | File | Ruolo |
|---|---|---|
| Working View principale | `ImportContabilitaWorkingView.jsx` | Tab Prima Nota, IVA, Partitario, Suggerimenti AI |
| Anteprima fattura | `WorkingViewInvoicePreviewTabs.jsx` | Visualizzazione documento XML |
| Azioni | `WorkingViewApplyActionsPopover.jsx` | Selezione conto/causale/data registrazione |
| Tabella prima nota | `WorkingViewPrimaNotaTable.jsx` | Righe Dare/Avere |

### Apertura working view
Funzioni di stato già implementate: `setWorkingViewOpen`, `setWorkingViewRowId`, `setWorkingViewRowIds`, `setWorkingViewTab`.

### Soluzione
- `onStartAccounting` riscritta: valida tutti i dati richiesti, poi apre `ImportContabilitaWorkingView` su tab Prima Nota.
- Dead code commit 24C rimosso (190 righe unreachable).
- `TEST_LAB_PHASE_24D.allowCommit = false` — nessun commit possibile.
- Pulsante di conferma nella working view: non presente (la working view è solo anteprima/predisposizione).

### Validazioni bloccanti pre-apertura
- Documento importato presente
- XML/anteprima disponibile
- Fornitore collegato
- Conto costo/ricavo selezionato
- Causale contabile FF demo impostata
- Imponibile > 0
- IVA presente
- Totale > 0
- Data documento specificata
- Data registrazione specificata
- Numero documento specificato
- Metadata test_lab presente

### Blocchi operativi
| Condizione | Azione |
|---|---|
| Società non demo | Blocco totale (banner warning) |
| 0 righe selezionate | Blocco (banner: "seleziona esattamente 1 riga") |
| >1 riga selezionata | Blocco (banner: "azioni massive disabilitate") |
| 1 riga non pronta | Blocco (banner: "completa la riga") |
| 1 riga pronta + validata | Apertura working view |

### Cosa NON viene fatto
- Nessun commit diretto
- Nessuna chiamata a `runCommitWorkflow` o `persistPrimaNotaDraft`
- Nessuna fattura generata
- Nessuna pulizia/delete
- Nessuna migration/env/auth/RLS/policy

### File
- `src/modules/test_mode/demoCompanyGuard.js` — `TEST_LAB_PHASE_24D`
- `src/modules/test_mode/TestLabPanel.jsx` — fase 24D
- `src/modules/test_mode/testLabPreparaWorkflow.js` — report + disabled reason 24D
- `src/modules/import_contabilita/index.jsx` — `onStartAccounting` → working view
- `tests/testLabIntegrazione.test.js` — 34 test (conformità 24D)

### Test manuali richiesti
1. Società demo → Import → 10 righe staging
2. Selezionare TL-ACQ-01 → "Avvia contabilizzazione" → verifica apertura working view
3. Verificare tab Prima Nota, IVA, Partitario
4. Selezionare 0 o >1 riga → verifica blocco
5. Società reale → verifica blocco completo

### Prossimo step
Validazione manuale working area, poi 24E (abilitazione commit controllato dalla working area).

## FASE 24D-FIX-1 — Riconoscimento società demo in Import / Working Area

### Problema risolto
Tendina Import mostrava la società demo per **denominazione**, ma `loadSocietaAttive` caricava solo `id,denominazione` — **`codice` assente** → `isDemoCompany` restituiva sempre `false` → blocco su "Avvia contabilizzazione".

### Causa
Campo `codice` perso nella query società del modulo Import (`importContabilitaRepo.loadSocietaAttive`).

### Fix
- Select società: `id,denominazione,codice`
- `resolveSocietaFromImportOptions` — risolve oggetto completo da tendina + fallback id/denominazione
- `evaluateDemoCompanyForImport` — guardia basata solo su `codice` (prefisso `__TEST__` / `test_`)
- Messaggio blocco diagnostico: id, denominazione, codice (o `mancante`)

### Nessun fallback su denominazione
Denominazione "FiscoSim Demo Test Lab SRL" con codice reale (es. `SIRIA`) resta **bloccata**.

### File
- `src/modules/import_contabilita/data/importContabilitaRepo.js`
- `src/modules/test_mode/demoCompanyGuard.js`
- `src/modules/import_contabilita/index.jsx` (`onStartAccounting`)

### Test manuali utente
1. Ricaricare Import Contabilità (refresh pagina per ricaricare tendina con `codice`).
2. Selezionare `FiscoSim Demo Test Lab SRL` → 1 riga pronta → **Avvia contabilizzazione** → working area si apre.
3. Società reale → blocco con diagnostica `codice=...` (non demo).

## FASE 24D-FIX-2 — Causali IVA working view Import demo

### Problema risolto
Tab IVA working view mostrava causali globali (A1, A17, …) e non autoproponeva TESTLAB22/10/04 per fattura ordinaria demo.

### Causa
- `loadCausaliIvaBySocieta` unisce globali + società → dropdown saturato da causali reali.
- Autoproposta usava `resolveIvaOrNull` che richiede `is_default_per_aliquota` (assente su seed TESTLAB).

### Fix
- `filterCausaliIvaForDemoWorkingView` — in società demo dropdown solo causali TESTLAB seedate.
- `resolveImportWorkingViewCausaleIvaId` — autoproposta per aliquota 22/10/4 → TESTLAB22/10/04.
- `assessWorkingViewIvaDraftRows` + merge checks — bozza con IVA senza causale → **Contabilizzazione bloccata** (“Causale IVA mancante”).

### File
- `src/modules/import_contabilita/domain/importContabilitaDemoCausaliIva.js`
- `src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx`
- `src/modules/import_contabilita/index.jsx`
- `src/modules/import_contabilita/tests/importContabilitaDemoCausaliIva.test.js`

### Test manuali utente
1. Demo → TL-ACQ-01 → working view tab IVA → causale **TESTLAB22** precompilata.
2. Dropdown mostra solo TESTLAB22/10/04.
3. Rimuovere causale IVA → stato **Contabilizzazione bloccata**.

## FASE 24E — Commit reale controllato da Working View (1 documento demo)

### Obiettivo
Contabilizzazione **reale** di **una sola** fattura demo ordinaria acquisto dalla working view Import, dopo preview PN/IVA/Partitario e conferma utente.

### Flusso
Import working table → selezione **1** riga pronta → working view → validazione → **Contabilizza documento demo** → `runCommitWorkflow` / `persistPrimaNotaDraft` → report esito.

### Guardie
- Solo società demo (`__TEST__` / `test_`)
- Esattamente 1 riga selezionata, stato PRONTA
- PN quadrata, IVA completa (causale TESTLAB), partitario fornitore completo
- Conto costo, causale FF, numero documento obbligatori
- Documento già committed → blocco
- Società reale → blocco

### Payload atteso TL-ACQ-01
- PN: costo Dare 1.000,00 · IVA credito Dare 220,00 · fornitore Avere 1.220,00
- IVA: registro acquisti, TESTLAB22, 22%
- Partitario: Demo 22 S.r.l., debito 1.220,00

### File
- `src/modules/import_contabilita/domain/importContabilitaDemoWorkingViewCommit.js`
- `src/modules/import_contabilita/index.jsx` (`handleDemoWorkingViewCommit`)
- `src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx`
- `src/modules/test_mode/demoCompanyGuard.js` (`TEST_LAB_PHASE_24E`)
- `src/modules/import_contabilita/tests/importContabilitaDemoWorkingViewCommit.test.js`

### Vietato in 24E
- Commit automatico o massivo
- Commit da working table senza working view
- Commit su società reali
- Pulizia/delete/migration

### Test manuali utente
1. Demo → TL-ACQ-01 solo → working view OK su tutte le tab
2. Contabilizza documento demo → conferma → verifica DB (PN, IVA, partitario)
3. TL-ACQ-02…10 non contabilizzate
4. >1 riga o società reale → blocco


## FASE 24E-FIX-1 — Debug commit demo silenzioso working view

### Problema risolto
Facendo click su "Contabilizza documento demo" e confermando, la contabilizzazione falliva in modo completamente silente, senza mostrare successi, errori o banner visibili, e lasciando lo spinner o la UI in stato di attesa indefinito.

### Causa
Qualsiasi errore o eccezione lanciata all'interno di `buildDemoWorkingViewCommitBundle` durante l'assemblaggio del payload (fuori dal vecchio try-catch di `handleDemoWorkingViewCommit`) bloccava in modo definitivo l'esecuzione. Inoltre, in caso di errori di convalida interni a `runCommitWorkflow`, i messaggi di blocco venivano catturati ma non stampati in console con log di sistema tracciabili.

### Soluzione
- **Try-Catch allargato e robusto**: l'intero flusso di `handleDemoWorkingViewCommit` in `index.jsx` è stato incapsulato in un blocco `try/catch/finally` globale. Lo spinner `demoCommitBusy` viene sempre resettato a `false` nel blocco `finally`, impedendo stati di pending infinito.
- **Log di diagnostica tracciabili**:
  - log di inizio con tag `[TEST_LAB_COMMIT_START]`.
  - log in caso di blocco da guardie o validazioni con tag `[TEST_LAB_COMMIT_BLOCKED]` (con dettagli su documento, società, motivo).
  - log in caso di eccezioni catch con tag `[TEST_LAB_COMMIT_ERROR]`.
- **Rafforzamento stato UI**:
  - passata la prop `isCommittingDemoDocument` impostata al valore di `demoCommitBusy` a `ImportContabilitaWorkingView`.
  - durante il caricamento/commit, il bottone in `ImportContabilitaWorkingView` viene disabilitato ed il suo testo mostra `"Contabilizzazione demo in corso..."`.
- **Successo e messaggi completi**:
  - il pop-up alert e il banner di successo espongono l'esito reale della transazione contabile in DB (ID prima nota, numero righe, righe registro IVA e partitario creati).
  - nello staging del modulo Import, solo la riga del documento contabilizzato viene aggiornata come `committed` (le restanti 9 rimangono invariate).

### File
- `src/modules/import_contabilita/index.jsx`
- `src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx`
- `src/modules/import_contabilita/tests/importContabilitaDemoWorkingViewCommit.test.js`

### Test manuali utente
1. Accedere alla società demo `__TEST__FISCOSIM_DEMO` → aprire la working view del documento `TL-ACQ-01`.
2. Cliccare su **Contabilizza documento demo** → confermare nel prompt `window.confirm`.
3. Verificare che durante il salvataggio il bottone diventi disabilitato con dicitura `"Contabilizzazione demo in corso..."`.
4. All'esito positivo, verificare la presenza del pop-up informativo di successo con i conteggi di righe inserite, e verificare che lo stato della riga passi a `committed` nello staging.
5. In caso di errore o blocco (ad es. togliendo causale o conti necessari), verificare la comparsa del banner di errore/warning e la presenza dei log `[TEST_LAB_COMMIT_BLOCKED]` / `[TEST_LAB_COMMIT_ERROR]` in console.


## FASE 24E-FIX-2 — Normalizzazione header.stato nel Commit Demo Import

### Problema risolto
Il commit demo di TL-ACQ-01 veniva bloccato nella validazione contabile con l'errore `motivo=header.stato non valido`.

### Causa
Il mapper canonico `mapImportContabilitaCommitPayloadToCanonical` assegnava al campo `payload.header.stato` il valore dello stato di convalida dello staging (ad es. `'ready'`). Tuttavia, `'ready'` non è presente nel set consentito di stati di Prima Nota canonici (`CANONICAL_ACCOUNTING_REGISTRATION_STATES` in `canonicalAccountingPayload.schema.js`), causando la bocciatura del payload da parte del validatore in modalità commit.

### Soluzione
- **Normalizzazione dello stato**: introdotta la funzione helper `resolveImportCommitPrimaNotaStato(rawStato, options)` nel modulo canonical mapper:
  - Gli stati di staging pronti (es. `'ready'`, `'ready_for_accounting'`, `'committed'`, `'processed'`) vengono normalizzati a `'confermata'` (lo stato contabile canonico per la scrittura a libro giornale).
  - Gli stati bozza (es. `'bozza'`, `'draft'`) rimangono `'bozza'`.
  - Gli stati di blocco (es. `'blocked'`, `'incomplete'`) passano a `'da_verificare'`.
- **Separazione dei domini**: lo stato del documento importato nello staging rimane `'committed'` (aggiornato in `sessionStorage` / `documenti_import`), mentre la scrittura contabile nel DB in Prima Nota assume il corretto stato canonico `'confermata'`.
- **Test unitari**: inseriti test specifici su `resolveImportCommitPrimaNotaStato` e sulla presenza del corretto valore `'confermata'` in `payload.header.stato` post-mappatura.

### File
- `src/modules/contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js`
- `src/modules/import_contabilita/tests/importContabilitaDemoWorkingViewCommit.test.js`

### Test manuali utente
1. Selezionare società demo → Import → aprire working view di `TL-ACQ-01`.
2. Cliccare su **Contabilizza documento demo** → confermare.
3. Verificare che la validazione non sia più bloccata da `header.stato non valido` e che il salvataggio contabile vada a buon fine generando la registrazione Prima Nota in stato `confermata` ed aggiornando lo staging a `committed`.
