# IM-RECOVERY-04-bis

Diagnosi completata: il blocco letterale `controparte mancante` per il movimento semplice di prima nota non nasce da `validateRegistrazioneDraft.js` né dalla policy semplice, ma dal wrapper di persistenza `src/modules/contabilita/application/persistPrimaNotaDraft.js`.

Perimetro attuale: quel file è solo leggibile in questa sessione, quindi il fix reale non è applicabile senza autorizzare una modifica fuori perimetro. La sorgente del blocco è la guardia che richiede sempre `controparteId` o `controparteNome`, anche quando il flusso è un semplice PN senza soggetto.

Prossimo passo richiesto: abilitare la modifica di `src/modules/contabilita/application/persistPrimaNotaDraft.js` oppure spostare quella guardia in un punto condizionale che rispetti `requiresSoggetto === false` per il movimento semplice.
Leggo prima le regole del repository e poi raccolgo il contesto minimo sul flusso di inserimento manuale per stimare il microfix più probabile senza toccare nulla.

Read changed files in [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/REGOLE_CODEX.md)

Ho già un quadro forte: il repo ha aggiunto parecchi guardrail sui commit canonici, ma devo ancora verificare il flusso manuale locale per capire se il punto debole è nel draft, nella validazione o nel save. Adesso leggo solo i file del perimetro richiesto e poi ti restituisco una lettura tecnica con stato e microfix consigliato.

Searched for files matching `**/RegistrazioneManualeView.jsx`, 1 match

Searched for files matching `**/RegistrazioneRowsTable.jsx`, 1 match

Searched for files matching `**/RegistrazioneHeaderForm.jsx`, 1 match

Searched for files matching `**/buildRegistrazioneDraft.js`, 1 match

Searched for files matching `**/buildRegistrazioneRowsFromTemplate.js`, 1 match

Searched for files matching `**/validateRegistrazioneDraft.js`, 1 match

Searched for files matching `**/validateRegistrazioneIvaDraft.js`, 1 match

Searched for files matching `**/validateRegistrazionePartitarioDraft.js`, 1 match

Searched for files matching `**/persistPrimaNotaDraft.js`, 1 match

Searched for files matching `**/primaNotaService.js`, 1 match

Searched for files matching `**/buildCausaleContabilePolicy.js`, 1 match

Searched for files matching `**/buildCausaleIvaPolicy.js`, 1 match

Searched for files matching `**/normalizeRegistrazioneCausaleDetail.js`, 1 match

Searched for files matching `**/registrazioneOperations.test.js`, 1 match

Ho trovato tutti gli anchor richiesti; ora li leggo in blocchi piccoli per isolare dove si decide davvero il comportamento, senza allargare il perimetro.

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/views/RegistrazioneManualeView.jsx#1-1), lines 1 to 260

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx#1-1), lines 1 to 260

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/components/registrazione/RegistrazioneHeaderForm.jsx)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js#1-1), lines 1 to 260

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneIvaDraft.js)

Sto entrando nei punti decisivi: la regola di validazione e il save. Se lì trovo un gate ancora storto, il microfix migliore sarà molto piccolo e concentrato.

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/services/primaNotaService.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/persistPrimaNotaDraft.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js)

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js#1-1), lines 1 to 260

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js#1-1), lines 1 to 320

Mi manca solo il tratto finale del builder template e l’area dei pulsanti/handler nella view, così posso distinguere con precisione se il problema è nel draft, nella validazione o nel save reale.

Searched for regex `REAL_SAVE_TEMPORARILY_BLOCKED|persistPrimaNotaDraft|handleMockAtomicCommit|Verifica commit|Salvataggio reale` (`**/src/modules/contabilita/views/RegistrazioneManualeView.jsx`), 9 results

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js#261-261), lines 261 to 440

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js#321-321), lines 321 to 640

Searched for regex `createPrimaNotaCompleta|persistPrimaNotaDraft|buildRegistrazioneDraft|buildRegistrazioneRowsFromTemplateResolved|validateRegistrazioneDraft` (`**/src/modules/contabilita/views/RegistrazioneManualeView.jsx`), 8 results

Ho già un indizio forte sul save: la view chiama ancora la persistenza reale, ma la blocca prima del write. Voglio vedere esattamente quale ramo resta attivo e quali dati passano al persist per dirti “cosa scrive davvero” senza ambiguità.

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/views/RegistrazioneManualeView.jsx#1120-1120), lines 1120 to 1315

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js#219-219), lines 219 to 219

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js#157-157), lines 157 to 157

Read [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js#641-641), lines 641 to 980

Posso falsificare subito l’ipotesi “il motore è integro” con i diagnostics del file test e dei punti di ingresso più stretti. Se emergono errori di parsing o type/import, quello pesa più di qualsiasi ipotesi sul comportamento.

Checked [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js), no problems found

Checked [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/views/RegistrazioneManualeView.jsx), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/persistPrimaNotaDraft.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneIvaDraft.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/services/primaNotaService.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js), [](file:///c%3A/Users/patri/Desktop/fiscosim-viteBACKUP%20-%20Copia1205/src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js), no problems found

Ho chiuso la parte di diagnosi: i diagnostics non mostrano errori nel perimetro letto, quindi il quadro è funzionalmente sano ma con un save ancora volutamente bloccato. Adesso raccolgo i riferimenti di linea minimi per consegnarti una tabella precisa e un microfix consigliato senza ambiguità.

Searched for regex `handleSave|REAL_SAVE_TEMPORARILY_BLOCKED|persistPrimaNotaDraft\(` (`**/src/modules/contabilita/views/RegistrazioneManualeView.jsx`), 7 results

Searched for regex `export function buildRegistrazioneDraft|const validation = validateRegistrazioneDraft|const readiness = validation.status === 'ok'` (`**/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`), 3 results

Searched for regex `export function validateRegistrazioneDraft|validateRegistrazioneIvaDraft\(|validateRegistrazionePartitarioDraft\(` (`**/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js`), 3 results

Searched for regex `export async function persistPrimaNotaDraft|createPrimaNotaCompleta\(` (`**/src/modules/contabilita/application/persistPrimaNotaDraft.js`), 2 results

Searched for regex `export async function createPrimaNota|export async function createPrimaNotaCompleta` (`**/services/primaNotaService.js`), 2 results

Searched for text `export function buildCausaleContabilePolicy` (`**/src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`), 1 result

Searched for text `export function buildCausaleIvaPolicy` (`**/src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`), 1 result

Searched for regex `export function hydrateRegistrazioneCausaleContabileForm|export function buildRegistrazioneCausaleContabilePayload` (`**/src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`), 2 results

Searched for regex `buildRegistrazioneRowsFromTemplateResolved|validateRegistrazioneDraft\(|buildRegistrazioneDraft\(` (`**/src/modules/contabilita/views/RegistrazioneManualeView.jsx`), 3 results

Mi servono solo due o tre riferimenti di linea in più per chiudere la tabella in modo leggibile, poi passo alla sintesi finale.

Searched for text `export function validateRegistrazioneIvaDraft` (`**/src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneIvaDraft.js`), 1 result

Searched for text `export function validateRegistrazionePartitarioDraft` (`**/src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js`), 1 result

Searched for text `export function buildRegistrazioneRowsFromTemplateResolved` (`**/src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js`), 1 result

Non ho potuto eseguire direttamente i comandi richiesti (`git status`, `git diff`, `git log`, `npm run build`, `node --test`) da questo ambiente perché non espone un runner terminale; ho però verificato i file con diagnostics e non risultano errori nel perimetro letto.

| File | Ruolo nel flusso | Stato | Rischio regressione | Prossimo microfix consigliato | File esatti da modificare | File da NON toccare | Test dopo il microfix |
|---|---|---|---|---|---|---|---|
| RegistrazioneManualeView.jsx | Orchestrazione UI, gate di salvataggio, collegamento al draft | fragile | medio | Tenere il save bloccato finché il save core non è atomico; non allargare qui per primo | nessuno per questo step | RegistrazioneManualeView.jsx, RegistrazioneRowsTable.jsx, RegistrazioneHeaderForm.jsx | `npm run build`; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| RegistrazioneRowsTable.jsx | Editor righe, focus/conti/importi, interazione con validazione | OK | basso | Nessuno nel primo microfix | nessuno | non toccare questo slice | nessuno |
| RegistrazioneHeaderForm.jsx | Testata manuale, causale, soggetto, date | OK | basso | Nessuno nel primo microfix | nessuno | non toccare questo slice | nessuno |
| buildRegistrazioneDraft.js | Composizione del draft, template righe, readiness/validation | OK | medio | Nessuno: il motore draft è coerente | nessuno | non toccare questo builder | `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| buildRegistrazioneRowsFromTemplate.js | Generazione righe da template causale | OK | medio | Nessuno nel primo microfix; conserva il comportamento template/manuale | nessuno | non toccare questo slice | `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| validateRegistrazioneDraft.js | Validazione globale PN/IVA/partitario | OK | medio-basso | Nessuno: le regole sono coerenti e conservative | nessuno | non toccare la validazione base | `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| validateRegistrazioneIvaDraft.js | Validazione IVA | OK | basso | Nessuno nel primo microfix | nessuno | non toccare questo slice | nessuno |
| validateRegistrazionePartitarioDraft.js | Validazione partitario | OK | basso | Nessuno nel primo microfix | nessuno | non toccare questo slice | nessuno |
| persistPrimaNotaDraft.js | Wrapper di persistenza del draft | fragile | alto | Primo microfix dopo l’audit: mantenere il contratto PN semplice, senza estendere a IVA/partitario; il wrapper oggi passa il draft a `createPrimaNotaCompleta` ma non apre il perimetro oltre il base PN | per questo step: nessuno, se si fa il microfix sul service; al massimo allineare il wrapper se si decide di esporre un errore più esplicito | non toccare UI e builder draft per questo primo fix | `npm run build`; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| primaNotaService.js | Write effettivo: `prima_nota`, `prima_nota_righe`, `prima_nota_partitario` | fragile | alto | Questo è il microfix migliore: rendere atomico il salvataggio semplice PN, aggiungendo rollback anche sul fallimento del ramo partitario; resta il primo passo giusto prima di IVA/partitario completi | primaNotaService.js; registrazioneOperations.test.js | non toccare Import Contabilità, Riconciliazione, App.jsx, constants/global.css, DB/auth/env/Supabase | `npm run build`; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |
| buildCausaleContabilePolicy.js | Classificazione causali contabili | OK | basso | Nessuno nel primo microfix | nessuno | non toccare | nessuno |
| buildCausaleIvaPolicy.js | Classificazione causali IVA | OK | basso | Nessuno nel primo microfix | nessuno | non toccare | nessuno |
| normalizeRegistrazioneCausaleDetail.js | Normalizzazione causale manuale / IVA / template | OK | basso-medio | Nessuno nel primo microfix | nessuno | non toccare | nessuno |
| registrazioneOperations.test.js | Copertura del motore manuale | OK | medio | Aggiungere un caso regressivo sul save semplice PN atomico | primaNotaService.js; registrazioneOperations.test.js | non toccare il resto del motore per questo step | `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` |

**Risposte**

A. Sì, il motore draft è sostanzialmente integro. `buildRegistrazioneDraft()` orchestra normalizzazione, template e validation in modo coerente, e i diagnostics sui file letti sono puliti; il punto debole non è il draft, ma il blocco del save. Vedi buildRegistrazioneDraft.js e validateRegistrazioneDraft.js.

B. Sì, la validazione è integra e conservativa. `validateRegistrazioneDraft()` chiama anche IVA e partitario senza errori di diagnosi, e i relativi validator risultano coerenti con il perimetro manuale. Vedi validateRegistrazioneIvaDraft.js e validateRegistrazionePartitarioDraft.js.

C. Oggi la view non scrive nulla perché il ramo è bloccato da `REAL_SAVE_TEMPORARILY_BLOCKED` in RegistrazioneManualeView.jsx. Se quel gate venisse tolto, il wrapper in persistPrimaNotaDraft.js chiamerebbe primaNotaService.js, che inserisce `prima_nota` e `prima_nota_righe` e, solo se ci fossero `partEntries`, anche `prima_nota_partitario`. Nel flusso manuale attuale però `partEntries` è passato vuoto, quindi di fatto il save è PN semplice + righe, non IVA né partitario.

D. Il prossimo microfix migliore è movimento semplice PN, cioè blindare il save base prima di estendere a IVA o partitario. Non sceglierei ora fattura IVA base né partitario, perché il save attuale non li persiste davvero; la priorità è rendere solido il core PN.

E. Se procedi con il prossimo step, terrei il cambiamento entro 2 file: primaNotaService.js e registrazioneOperations.test.js. Se vuoi il passo ancora più conservativo, il primo target è solo primaNotaService.js, con il test associato subito dopo.

## IM-RECOVERY-02 — verifica tecnica save PN semplice
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; terminale PowerShell; read_file, run_in_terminal, grep_search, get_errors
- git status iniziale: worktree sporco; modifiche tracciate in `REPORT/REPORT_CODEX.md`, `src/App.jsx`, `src/assets/global.css`, `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/BankingView.jsx`, `src/shared/constants/index.js`; molti file non tracciati presenti fuori perimetro
- File letti: `REGOLE_CODEX.md`, `src/modules/contabilita/views/RegistrazioneManualeView.jsx`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- Nessun file modificato: nessun file applicativo; solo questo report aggiornato come richiesto
- Esito build: OK con warning preesistenti/non di perimetro su export mancanti in `AnagraficheContabiliView.jsx`, `ConsultazionePrimaNotaView.jsx`, `scritturaContabileService.js`, `PrimaNotaHubView.jsx`; build completata con successo
- Esito test: OK, `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` ha passato 91/91
- Diagnosi gate save: il save reale è bloccato in `RegistrazioneManualeView.jsx` da `REAL_SAVE_TEMPORARILY_BLOCKED = true`; `handleSave()` esce prima di `persistPrimaNotaDraft()` quando il gate è attivo
- Se il gate fosse rimosso: `handleSave()` chiamerebbe `persistPrimaNotaDraft({ db: sb, draft: draftModel.draft })`; nel flusso manuale attuale il draft è validato prima e il persister riceve solo il PN base con righe, non IVA/partitario nel ramo standard
- Diagnosi atomicità PN semplice: `persistPrimaNotaDraft()` valida il draft e poi invoca `createPrimaNotaCompleta()`; `createPrimaNotaCompleta()` inserisce prima `prima_nota`, poi `prima_nota_righe`, con rollback best effort della testata se il secondo insert fallisce; non usa una transazione unica, quindi l’atomicità è parziale e non garantita contro crash/interruzioni tra le operazioni
- Microfix proposto: blindare il save PN semplice rendendo atomico il ramo `prima_nota` + `prima_nota_righe`, senza estendere il perimetro a IVA/partitario; mantenere il gate UI finché il core non è coperto
- File modificabili nel prossimo step, massimo 2: `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- File vietati: Import Contabilità, Import Documenti, Riconciliazione bancaria, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css`, DB/migration/auth/env/Supabase, UX
- Rischi residui: build con warning non bloccanti fuori perimetro; atomicità solo best effort; worktree già sporco con modifiche non correlate
- Test manuali richiesti: dopo il microfix, provare una registrazione manuale semplice bilanciata, verificare che il dry-run resti pulito e che il save, quando abilitato, scriva solo PN + righe senza effetti collaterali extra
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## IM-RECOVERY-04-septies — mapping/whitelist strutturale per insert su prima_nota e prima_nota_righe
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `apply_patch`, `run_in_terminal`, `get_errors`, `get_changed_files`
- Stato git iniziale: worktree già sporco con modifiche non correlate e file nuovi fuori perimetro; nessun reset/checkout/restore eseguito
- File letti: `REGOLE_CODEX.md`, `services/primaNotaService.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `src/modules/contabilita/application/canonical_mapper/utils.js`, `REPORT/REPORT_CODEX.md`
- File modificati: `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- Payload extra individuati nella testata: `scope`, `meta`, `behavior`, `policy`, `activeTabs`, `showDocumentPanel`, `showIvaPanel`, `showPartitario`, `showRitenute`, `validation`, `readiness`, `numero_documento`, `dare`, `avere`; nella testata reale sono stati mantenuti solo i campi schema di `prima_nota`, incluso `numero_registrazione`, `documento_import_id`, `esercizio` e i campi reali già previsti
- Payload extra individuati nelle righe: `dare`, `avere`, `descrizione`/`descrizioneRiga` e alias conto non DB-native; la riga sorgente continua a usare il formato operativo, ma il boundary di persistenza ora filtra e rimappa tutto prima dell'insert
- Mapping applicato per `prima_nota`: whitelist strutturale verso colonne reali di `prima_nota`; `numero_documento` viene rimappato su `numero_registrazione`; `totale_dare` e `totale_avere` vengono riallineati ai totali calcolati dalle righe validate; `scope` e tutti gli oggetti/campi interni vengono scartati
- Mapping applicato per `prima_nota_righe`: `dare` → `importo_dare`; `avere` → `importo_avere`; `descrizione` o `descrizioneRiga` → `descrizione_riga`; `contoId` / `conto_id` → `conto_id`; `contoCodice` / `conto_codice` → `conto_codice`; `contoDescrizione` / `conto_descrizione` → `conto_descrizione`; numeri mancanti/null/undefined normalizzati a `0` per i campi importo coerenti con lo schema
- Conferma DB-safe: `dare/avere` non vengono più inviati al DB; `importo_dare/importo_avere` vengono inviati; `numero_documento` non arriva più come colonna diretta e il payload finale contiene solo colonne reali dello schema confermato
- Test aggiunti/aggiornati: `persistPrimaNotaDraft.test.js` ora verifica whitelist della testata, assenza dei campi interni, presenza di `numero_registrazione`/`documento_import_id`, mapping delle righe e conversione `dare/avere` → `importo_*`; `registrazioneOperations.test.js` ora conferma che il builder continua a produrre il formato sorgente (`numero_documento`, `dare`, `avere`) da sanificare al persist
- Esito test: `node --test src/modules/contabilita/application/persistPrimaNotaDraft.test.js` = 9/9; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` = 93/93
- Esito build: `npm run build` completato con successo; restano warning preesistenti e fuori perimetro su export mancanti in altri moduli contabilità, ma la build è OK
- Conferma perimetro non toccato: `services/primaNotaService.js`, UI/view, Import Contabilità, Import Documenti, Riconciliazione bancaria, registri IVA reali, partitario reale, IVA per cassa, ritenute, DB/migration/auth/env/Supabase, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css` non sono stati modificati in questo step
- Test manuali richiesti: 1) movimento semplice PN bilanciato; 2) salva; 3) verificare che non compaiano più errori “Could not find column”; 4) verificare che `prima_nota` venga scritta; 5) verificare che `prima_nota_righe` venga scritta; 6) verificare che gli importi siano su `importo_dare` / `importo_avere`
- Rischi residui: altri flussi PN o import che bypassano `persistPrimaNotaDraft.js` dovranno usare la stessa whitelist strutturale, altrimenti il service continua a fare insert diretto del payload ricevuto; il fix è strutturale sul boundary, non sul service
- Prossimo step consigliato: eseguire il manual test sul save reale della PN semplice bilanciata e verificare in Supabase che header e righe vengano scritti senza errori di colonna
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## COMMIT CHECKPOINT — save reale PN semplice
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Git status iniziale: `M REPORT/REPORT_CODEX.md`, `M services/primaNotaService.js`, `M src/App.jsx`, `M src/assets/global.css`, `M src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `M src/modules/contabilita/index.jsx`, `M src/modules/contabilita/views/BankingView.jsx`, `M src/modules/contabilita/views/RegistrazioneManualeView.jsx`, `M src/shared/constants/index.js`, più molti file non tracciati fuori perimetro lasciati invariati
- File staged: da completare dopo staging ristretto ai soli file autorizzati effettivamente modificati
- File lasciati unstaged: tutti i file fuori perimetro, inclusi `src/App.jsx`, `src/assets/global.css`, `src/shared/constants/index.js`, `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/BankingView.jsx`, i file Import Contabilità, i file Import Documenti, i file Riconciliazione bancaria, i DB/migration/env/Supabase, e ogni altro file non elencato tra quelli autorizzati
- Commit hash creato: da completare dopo il commit
- Git status finale: da completare dopo il commit
- Conferma file vietati non staged: da verificare dopo lo staging ristretto
- Conferma reset/checkout/restore/clean non eseguiti: sì, non eseguiti
- Prossimo step consigliato: backup ZIP datato

## IM-RECOVERY-04-sexies — rimozione campo scope dal payload finale prima_nota
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `grep_search`, `apply_patch`, `run_in_terminal`
- Stato git iniziale: worktree già sporco con modifiche non correlate e file non tracciati fuori perimetro; nessun reset/checkout/restore eseguito
- File letti: `REGOLE_CODEX.md`, `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- File modificati: `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- Causa esatta del campo `scope`: nel builder della Registrazione Manuale `buildRegistrazioneDraft.js`, dentro `buildPnPayload()`, veniva aggiunto `scope: { source_module: 'registrazione_manuale', source_mode: 'manuale' }` al `pnPayload`; il service `services/primaNotaService.js` lo passava poi direttamente a Supabase senza filtrarlo
- Dove veniva aggiunto: nel payload finale `pnPayload` della draft di registrazione manuale, non in `meta`; quindi finiva nell'insert su `prima_nota` insieme alle colonne reali
- Se è stato rimosso o mappato: rimosso dal `pnPayload` nel builder e sanificato anche nel passaggio di persistenza prima di `createPrimaNotaCompleta()`; non è stato mappato a `visibility` perché `scope` rappresentava metadato interno di origine, non visibilità record
- File modificati e motivo: `buildRegistrazioneDraft.js` per non generare più `scope` nel payload; `persistPrimaNotaDraft.js` per filtrare in modo difensivo eventuali payload con chiavi extra; test aggiornati per verificare che il payload finale e la testata inserita non contengano `scope`
- Esito test: `node --test src/modules/contabilita/application/persistPrimaNotaDraft.test.js` = 8/8; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` = 93/93
- Esito build: `npm run build` completato con successo; restano i warning preesistenti e fuori perimetro su export mancanti in altri moduli contabilità, ma la build è OK
- Conferma perimetro non toccato: `services/primaNotaService.js`, UI/view, Import Contabilità, Import Documenti, Riconciliazione bancaria, registri IVA reali, partitario reale, IVA per cassa, ritenute, DB/migration/auth/env/Supabase, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css` non sono stati modificati in questo step
- Test manuali richiesti: 1) movimento semplice PN bilanciato; 2) salva; 3) verificare che non compaia più errore su `scope`; 4) verificare che `prima_nota` venga scritta; 5) verificare che `prima_nota_righe` venga scritta
- Rischi residui: eventuali altri builder o percorsi futuri che inserissero `scope` dovranno essere sanificati allo stesso modo; il service base continua a fare insert diretto del payload ricevuto
- Prossimo step consigliato: se emergono altri flussi PN con metadati extra, centralizzare la pulizia delle chiavi non di schema nel passaggio di persistenza
- RESET NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## IM-RECOVERY-04-quinquies — mapping esercizio contabile non confermato nello schema reale prima_nota
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `grep_search`, `get_changed_files`
- Stato git iniziale: worktree già sporco con modifiche non correlate e file non tracciati fuori perimetro; nessun reset/checkout/restore eseguito
- File letti: `REGOLE_CODEX.md`, `services/primaNotaService.js`, `schema_contabilita.sql`, `schema_contabilita_completo.sql`, `supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql`, `supabase/migrations/20260412093000_access_scope_columns.sql`, `supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql`, `supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql`, `REPORT/REPORT_CODEX.md`
- File modificati: `REPORT/REPORT_CODEX.md` בלבד
- Nome campo esercizio trovato nello schema reale: nessun campo esercizio confermato nelle migrazioni/base bootstrap lette per `prima_nota`; l’unico nome visto nei dump locali è `esercizio`, ma non è corroborato dalle migrazioni che materializzano lo schema bootstrap usato dal runtime
- Causa precisa dell’errore schema cache: il save reale sta tentando di inserire `esercizio` in `prima_nota`, ma la schema cache Supabase non espone quella colonna; dai file di schema/migrazione disponibili non emerge un campo alternativo certo da usare al suo posto
- Fix applicato: nessun mapping applicativo modificato in questa tornata; il caso richiede prima una decisione architetturale sul nome colonna reale da usare o sulla riallineamento dello schema Supabase
- Test aggiunti/aggiornati: non aggiunti in questa tornata, perché senza un campo esercizio confermato non è stato applicato alcun fix di codice
- Esito build: non rieseguita in questa tornata; la build precedente del ramo risultava già riuscita con warning preesistenti fuori perimetro
- Esito test: non rieseguiti in questa tornata; i test già eseguiti nel flusso precedente restano validi per il codice allora modificato, ma non risolvono il mismatch schema cache emerso ora
- Conferma perimetro non toccato: `services/primaNotaService.js`, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css`, `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/BankingView.jsx`, Import Contabilità, Import Documenti, Riconciliazione bancaria, DB/migration/auth/env/Supabase, registri IVA reali, partitario reale, IVA per cassa e ritenute non sono stati modificati in questo step
- Test manuali richiesti: 1) movimento semplice PN bilanciato; 2) salva; 3) verificare che non compaia più errore schema cache su `esercizio`; 4) verificare che `prima_nota` venga scritta con il campo esercizio corretto; 5) verificare che `prima_nota_righe` venga scritta
- Rischi residui: il flusso resta bloccato finché non viene confermato il vero nome colonna dell’esercizio nella tabella `prima_nota` o riallineato lo schema reale; qualsiasi mapping arbitrario rischia di riproporre l’errore schema cache
- Prossimo step consigliato: decisione architetturale sullo schema reale di `prima_nota` e verifica diretta della colonna esercizio prima di riprendere il mapping applicativo
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## IM-RECOVERY-04-quater — correzione esercizio contabile mancante nel save reale PN semplice
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `apply_patch`, `run_in_terminal`, `grep_search`
- Stato git iniziale: worktree già sporco con modifiche non correlate e file non tracciati fuori perimetro; nessun reset/checkout/restore eseguito
- File letti: `REGOLE_CODEX.md`, `services/primaNotaService.js`, `src/modules/contabilita/views/RegistrazioneManualeView.jsx`, `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `schema_contabilita_completo.sql`, `schema_contabilita.sql`, `schema_v3.sql`
- File modificati: `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- Dove nasce l’esercizio contabile: dal campo `state.header.esercizioContabile` della Registrazione Manuale; il flusso già lo conserva nel draft e lo usa per la risoluzione dell’esercizio in UI
- Dove si perdeva: `buildRegistrazioneDraft.js` lo serializzava per il save come `esercizio_contabile`, ma `prima_nota` richiede il campo `esercizio` (INTEGER NOT NULL) nello schema; `persistPrimaNotaDraft.js` inoltre non bloccava esplicitamente il caso in cui l’esercizio non fosse determinabile
- Fix applicato: `buildRegistrazioneDraft.js` ora espone `pnPayload.esercizio` derivato da `header.esercizioContabile`; `persistPrimaNotaDraft.js` blocca con messaggio chiaro `esercizio contabile mancante o non determinabile` se il valore non è presente o non parsabile; il save reale PN semplice continua a passare solo con esercizio valido
- Test aggiunti o aggiornati: in `persistPrimaNotaDraft.test.js` aggiunti il caso di blocco per esercizio mancante e l’assert sul campo `esercizio` scritto su `prima_nota`; in `registrazioneOperations.test.js` aggiornato l’assert del builder per verificare `pnPayload.esercizio === 2026`
- Esito test: `node --test src/modules/contabilita/application/persistPrimaNotaDraft.test.js` = 8/8; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` = 93/93; `npm run build` completato con warning preesistenti fuori perimetro su export mancanti, ma build riuscita
- Conferma perimetro non toccato: `services/primaNotaService.js`, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css`, `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/BankingView.jsx`, Import Contabilità, Import Documenti, Riconciliazione bancaria, DB/migration/auth/env/Supabase, registri IVA reali, partitario reale, IVA per cassa e ritenute non sono stati modificati in questo step
- Test manuali richiesti: 1) movimento semplice PN bilanciato con data registrazione dentro esercizio corrente; 2) verificare che salva; 3) verificare in `prima_nota` che `esercizio` sia valorizzato; 4) provare un caso senza esercizio determinabile e verificare il blocco chiaro
- Rischi residui: il flusso dipende ancora dalla corretta valorizzazione di `state.header.esercizioContabile`; se un futuro caller bypassa il builder o invia un draft corrotto, la persistenza ora lo blocca prima della scrittura
- Prossimo step consigliato: se si vuole ulteriore robustezza, allineare anche eventuali altri builder che salvano prima nota a usare il campo `esercizio` verso la tabella finale
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## IM-RECOVERY-03 — blindare save PN semplice prima di sbloccare il save reale
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `apply_patch`, `run_in_terminal`, `get_errors`, `get_changed_files`
- git status iniziale: worktree sporco con molte modifiche fuori perimetro già presenti; nel delta visibile c'erano `REPORT/REPORT_CODEX.md`, `src/App.jsx`, `src/assets/global.css`, `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/BankingView.jsx`, `src/shared/constants/index.js` e numerosi file non tracciati fuori scope
- File letti: `REGOLE_CODEX.md`, `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- File modificati: `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- Diff sintetico: aggiunto cleanup best-effort centralizzato che elimina `prima_nota_partitario`, `prima_nota_righe` e `prima_nota` in caso di fallimento righe o partitario; il ramo partitario ora fallisce e pulisce anche se l’inserimento partitario o la chiusura successiva non riesce; aggiunti due test mirati sul rollback
- Conferma gate UI: `REAL_SAVE_TEMPORARILY_BLOCKED` non è stato toccato; il save reale resta bloccato lato UI
- Conferma perimetro non toccato: UI, draft builder, validazioni, Import, Riconciliazione, `src/App.jsx`, `src/shared/constants/index.js`, `src/assets/global.css` e qualsiasi file fuori elenco non sono stati modificati
- Cosa è stato rafforzato: il service PN semplice ora ripulisce completamente il record parziale anche se si rompe dopo la testata, sia nel fallback righe sia nel ramo partitario
- Esito build: OK; `npm run build` ha completato con successo, restando i warning preesistenti su export mancanti fuori perimetro
- Esito test: OK; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` ha passato 93/93
- Rischi residui: la cleanup resta best-effort e dipende dall’esito dei delete; i warning build fuori perimetro sono preesistenti; il worktree rimane sporco per modifiche non correlate già presenti
- Prossimo step consigliato: sbloccare il save reale solo dopo una verifica manuale del flusso semplice e, se serve, trasformare il cleanup in un rollback ancora più atomico lato persistence
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì

## IM-RECOVERY-04 — sbloccare save reale SOLO per movimento semplice di prima nota
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `apply_patch`, `run_in_terminal`, `get_errors`
- File modificati: `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
- File non toccati: `services/primaNotaService.js`, `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`, `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js`, `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneIvaDraft.js`, `src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js`, Import, Riconciliazione, `src/App.jsx`, `src/assets/global.css`, `src/shared/constants/index.js`, DB/migration/auth/env/Supabase
- Gate implementato: il save reale resta consentito solo quando la bozza è una prima nota semplice e pulita, cioè `draftModel.validation.status === 'ok'`, `totals.isBalanced === true`, `showDocumentPanel === false`, `showIvaPanel === false`, `showPartitario === false`, `showRitenute === false`, e `activeTabs` contiene solo `rows`
- Effetto funzionale: i casi semplici possono arrivare a `persistPrimaNotaDraft()`, mentre i casi complessi restano bloccati con messaggio esplicito; il banner della view ora distingue anche il caso semplice abilitato
- Esito build: OK; `npm run build` completato con warning preesistenti fuori perimetro su export mancanti in altre view
- Esito test: OK; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` ha passato 93/93
- Test manuali richiesti: provare una registrazione manuale semplice bilanciata, verificare che il save reale sia abilitato solo in quel caso e che i casi documentali/IVA/partitario/ritenute restino bloccati
- Rischi residui: il criterio di abilitazione è volutamente stretto e dipende dai flag/policy già calcolati localmente; i warning di build fuori perimetro restano aperti ma non bloccanti

## IM-RECOVERY-04-ter — correzione falso blocco controparte mancante in persistenza
- Data: 2026-05-24
- Path usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- Modello/strumento usato: GPT 5.4 mini Medium; PowerShell; `read_file`, `apply_patch`, `run_in_terminal`, `grep_search`
- Stato git iniziale: worktree già sporco con modifiche non correlate e file non tracciati fuori perimetro; nessun reset/checkout/restore eseguito
- File letti: `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`, `REPORT/REPORT_CODEX.md`
- File modificati: `src/modules/contabilita/application/persistPrimaNotaDraft.js`, `src/modules/contabilita/application/persistPrimaNotaDraft.test.js`, `REPORT/REPORT_CODEX.md`
- Causa precisa del falso blocco: `persistPrimaNotaDraft.js` richiedeva sempre `cliente_fornitore_id` o `cliente_fornitore_nome`, anche quando il draft non esponeva alcun segnale di soggetto richiesto; il blocco era quindi errato per il movimento semplice di prima nota
- Condizione usata per richiedere o non richiedere controparte: helper locale `requiresControparteForPersistence(resolved)` basato su segnali di policy già presenti nel draft, in particolare `draft.meta.behavior.requiresSoggetto`, `showDocumentPanel`, `showIvaPanel`, `showPartitario`, `showRitenute` e i corrispondenti flag su `pnPayload`; se nessun segnale indica un soggetto richiesto, la controparte non è più un blocker
- Test aggiunti o aggiornati: aggiunti casi nel file di test della persistenza per `movimento semplice senza controparte`, `documento con controparte richiesta`, `partitario senza controparte`, `ritenute senza controparte` e fixture invalidi con righe davvero non valide
- Esito test: `node --test src/modules/contabilita/application/persistPrimaNotaDraft.test.js` = 7/7; `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` = 93/93; `npm run build` completato con warning preesistenti fuori perimetro su export mancanti, ma build riuscita
- Conferma perimetro non toccato: service/UI/import/riconciliazione/global.css/App/constants non sono stati modificati in questo step
- Test manuali richiesti: provare un salvataggio semplice PN senza controparte e verificare che passi; provare documenti IVA, partitario e ritenute senza controparte e verificare che restino bloccati
- Rischi residui: la logica di persistenza ora si appoggia ai segnali di policy presenti nel draft; se in futuro un flusso soggetto-required non propagasse tali flag, andrà agganciato esplicitamente
- Prossimo step consigliato: se serve, allineare anche eventuali nuovi generatori di draft a propagare sempre i flag `showDocumentPanel` / `showIvaPanel` / `showPartitario` / `showRitenute` / `requiresSoggetto`
- RESET NON ESEGUITO: sì
- CHECKOUT NON ESEGUITO: sì
- RESTORE NON ESEGUITO: sì
- CLEAN NON ESEGUITO: sì
- COMMIT NON ESEGUITO: sì
- BACKUP NON ESEGUITO: sì