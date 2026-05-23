# REPORT CODEX - Audit Registrazione Manuale nuova

Ambito:
- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

Data audit:
- `2026-05-23`

## 1. Path effettivamente usato

- Path di lavoro verificato e usato per l'audit: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- La cartella vecchia `C:\Users\patri\Desktop\fiscosim-viteBACKUP` non e' stata usata in questo task.

## 2. Conferma lettura `REGOLE_CODEX.md`

- `REGOLE_CODEX.md` e' stato letto integralmente prima di qualunque analisi.
- Vincoli applicati durante l'audit:
  - una sola cartella di lavoro
  - nessuna modifica a codice applicativo
  - nessuna modifica a DB, auth, env o migration
  - nessun report sparso oltre `REPORT/REPORT_CODEX.md`
  - nessuna build, backup o commit perche' task solo audit

## 3. File letti

| File | Ruolo nell'audit |
|---|---|
| `REGOLE_CODEX.md` | regole operative ferree |
| `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | entry point reale della manuale nuova |
| `src/modules/contabilita/views/PrimaNotaHubView.jsx` | router del workspace contabile |
| `src/modules/contabilita/index.jsx` | menu/tab del modulo contabilita |
| `src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx` | griglia righe manuali |
| `src/modules/contabilita/components/registrazione/*` | header, documento, IVA, partitario, ritenute, preview, shortcuts, modali |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js` | composizione draft e validazioni |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js` | righe da template causale |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneTemplateRowAccount.js` | risoluzione conto soggetto/template |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneConti.js` | ricerca e label conto |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneControparti.js` | lista controparti |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js` | validazione bozza |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js` | validazione partitario |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneRitenutaDraft.js` | validazione ritenute |
| `src/modules/contabilita/application/persistPrimaNotaDraft.js` | persistenza bozza |
| `services/primaNotaService.js` | scrittura `prima_nota`, `prima_nota_righe`, eventuale `partitario` |
| `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js` | payload canonico manuale |
| `src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js` | mapping manuale -> canonical |
| `services/accountingCommitService.js` | commit canonico pianificato |
| `services/registerDocumentoPrimaNotaFromContabilita.js` | flusso documento `documenti_contabilita` -> prima nota |
| `src/shared/utils/primaNotaDraftFromDocumento.js` | builder guidato da documento |
| `src/modules/contabilita/prima_nota_guidata.jsx` | legacy storico presente |
| `src/App.jsx` | router principale applicazione |

## 4. Mappa entry point

### Entry point reale della manuale nuova

| Livello | File | Esito |
|---|---|---|
| Componente attivo | `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | componente reale della manuale nuova |
| Router di sezione | `src/modules/contabilita/views/PrimaNotaHubView.jsx` | rende la manuale quando `contTab === 'prima_nota_guidata'` |
| Router del modulo | `src/modules/contabilita/index.jsx` | espone il tab/menu `prima_nota_guidata` |

### Ruolo di `prima_nota_guidata`

- `prima_nota_guidata` non e' solo una label.
- Influisce ancora sul flusso perche' e':
  - chiave di tab nel router del modulo contabilita
  - branch operativo in `PrimaNotaHubView.jsx`
  - stringa legacy ancora usata in componenti e payload canonico
- Quindi il nome e' legacy, ma il flusso e' ancora reale.

## 5. Mappa file attivi

### UI e componenti attivi

| File | Stato | Nota |
|---|---|---|
| `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | ATTIVO | manuale nuova |
| `src/modules/contabilita/views/PrimaNotaHubView.jsx` | ATTIVO | monta la manuale nuova |
| `src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx` | ATTIVO | rendering righe |
| `src/modules/contabilita/components/registrazione/*` | ATTIVO | header, document, IVA, partitario, ritenute, preview, shortcuts, modali |

### Application / operations attive

| File | Stato | Nota |
|---|---|---|
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js` | ATTIVO | compone draft, validation e payload |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js` | ATTIVO | righe auto da causale |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneTemplateRowAccount.js` | ATTIVO | soggetto/template account |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneControparti.js` | ATTIVO | elenco controparti |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneConti.js` | ATTIVO | selezione e descrizione conto |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js` | ATTIVO | blocchi e warning |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js` | ATTIVO | validazione partitario |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneRitenutaDraft.js` | ATTIVO | validazione ritenute |
| `src/modules/contabilita/application/persistPrimaNotaDraft.js` | ATTIVO | persistenza bozza |

### Domain / canonical / servizi attivi

| File | Stato | Nota |
|---|---|---|
| `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js` | ATTIVO ma non nel save UI corrente | prepara il commit canonico |
| `src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js` | ATTIVO ma non nel save UI corrente | mapping verso canonical |
| `services/primaNotaService.js` | ATTIVO | insert PN e righe, partitario solo se ci sono part entries |
| `services/accountingCommitService.js` | ATTIVO/transizione | commit pianificato documenti_contabilita + PN + IVA + partitario |
| `services/registerDocumentoPrimaNotaFromContabilita.js` | ATTIVO | flusso documento -> PN |
| `src/shared/utils/primaNotaDraftFromDocumento.js` | ATTIVO | builder da documento |

## 6. Mappa legacy / vietati trovati

| Riferimento | Dove compare | Tipo di riferimento | Nota operativa |
|---|---|---|---|
| `src/modules/contabilita/prima_nota_guidata.jsx` | file presente nel repo, non importato dal flusso attivo della manuale nuova | legacy file | solo da leggere se indispensabile |
| `prima_nota_guidata` | `src/modules/contabilita/index.jsx`, `src/modules/contabilita/views/PrimaNotaHubView.jsx`, `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js`, `src/App.jsx` | tab/label/stringa legacy | ancora operativo come chiave di routing |
| `import_fatture` | `src/App.jsx`, `src/modules/import_fatture/*`, vari servizi legacy | import reale + route reale | legacy ancora esposto nell'app |
| `import_unificato` | `src/App.jsx`, `src/modules/import_unificato/*`, vari servizi legacy | import reale + route reale | legacy ancora esposto nell'app |
| `import_nuovo` | `src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js` | marker/stringa legacy | non e' il flusso manuale attivo |
| `DISUSO` | root repo e riferimenti di progetto | cartella legacy | non usata per lo sviluppo nuovo |
| `accounting_entries` | `services/*.js`, `src/components/PipelineResultView.jsx`, `src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js`, altri | table legacy / stringa operativa | ancora presente in molte aree storiche |
| `documenti_import` | `src/App.jsx`, `services/adminReset/*`, `src/modules/import_unificato/*`, `src/modules/lettura_mail/*`, `src/modules/test_mode/*` | staging/legacy | non e' la base contabile della manuale nuova |
| `partitari` legacy | `src/App.jsx`, `services/*.js`, `services/testScenarioEngine.js`, `src/modules/test_mode/*`, `src/modules/import_unificato/*` | table legacy / stringa operativa | ancora presente in aree storiche |

## 7. Flusso salvataggio reale attuale

### Percorso reale dal click "Salva"

1. `RegistrazioneManualeView.handleSave()`
2. `persistPrimaNotaDraft({ db: sb, draft: draftModel.draft })`
3. `resolveDraftBundle(...)`
4. `buildPersistenceValidation(...)`
5. `createPrimaNotaCompleta(...)`
6. `createPrimaNota(...)` -> insert su `prima_nota`
7. `insertPrimaNotaRighe(...)` -> insert su `prima_nota_righe`
8. `insertPrimaNotaPartitario(...)`
9. `applyPartitarioClosures(...)` solo se esistono `partEntries`

### Punti critici del percorso attuale

| Elemento | Stato |
|---|---|
| `draftModel.draft` | prodotto da `buildRegistrazioneDraft(...)` |
| `draftModel.validation` | usata per bloccare o consentire il save |
| `rowsWithCounterpartySync` | usata nel draft, non nel commit canonico completo |
| `partEntries` verso `persistPrimaNotaDraft` | `[]` nel path attivo della manuale nuova |
| `postCommitTargets` | presenti nel codice canonico, ma non attivati dal save UI corrente |

## 8. Tabelle scritte / non scritte

### Tabelle scritte dal path attivo

| Tabella | Esito | Nota |
|---|---|---|
| `prima_nota` | SCRITTA | da `createPrimaNotaCompleta` |
| `prima_nota_righe` | SCRITTA | da `createPrimaNotaCompleta` |

### Tabelle non scritte dal path attivo

| Tabella | Esito | Nota |
|---|---|---|
| `registri_iva` | NON SCRITTA | non c'e' insert diretto nel save della manuale nuova |
| `documenti_contabilita` | NON SCRITTA | il path manuale attivo non aggiorna il documento sorgente |
| `partitario` | NON SCRITTO come step diretto del save | viene toccato solo se esistono `partEntries`, ma il path attivo passa `partEntries: []` |

## 9. Gap rispetto all'asse canonico

Asse richiesto:

`documenti_contabilita -> prima_nota -> prima_nota_righe -> registri_iva -> partitario`

### Stato attuale

| Step | Stato | Osservazione |
|---|---|---|
| `documenti_contabilita` -> `prima_nota` | PARZIALE / separato | esiste il flusso documento-guidato (`registerDocumentoPrimaNotaFromContabilita`), ma non e' il save della manuale nuova |
| `prima_nota` -> `prima_nota_righe` | SI | scritto dal path attivo |
| `prima_nota_righe` -> `registri_iva` | NO | non scritto dal path attivo |
| `registri_iva` -> `partitario` | NO | non scritto dal path attivo |
| `partitario` | PARZIALE | solo aggiornamenti indiretti/best effort se ci sono `partEntries` |

### Rischi di incoerenza contabile/fiscale

1. una UI quadrata puo' non generare tutti i record fiscali necessari;
2. il partitario puo' risultare fuori sync rispetto a PN e righe;
3. `documenti_contabilita` e registrazione manuale restano su due assi logici diversi;
4. l'operatore puo' considerare conclusa una scrittura che in DB contiene solo PN + righe.

## 10. Adeguatezza funzionale della Registrazione Manuale

### Gia' gestito o parzialmente gestito

| Area | Stato |
|---|---|
| causale contabile configurabile | SI |
| soggetto cliente/fornitore | SI |
| righe prima nota | SI |
| documento IVA | SI, come pannello/bozza |
| registri IVA | PARZIALE in UI, non nel save attivo |
| partitario | PARZIALE in UI e validazione |
| ritenute | PARZIALE |
| scadenze | NO come persistenza diretta del flusso manuale |
| quadratura | SI |
| validazioni bloccanti | SI |
| audit/log operatore | PARZIALE, soprattutto tramite meta/draft e servizi collegati |

### Pronta come motore riutilizzabile?

- **Parzialmente.**
- E' gia' una base utile per:
  - registrazione manuale
  - regole di validazione
  - template causali
  - soggetto/controparte
- Non e' ancora pronta come motore riutilizzabile unico per:
  - Import Contabilita
  - Riconciliazione bancaria
  - salvataggio fatture + registri IVA + partitario in un unico asse

## 11. Rischi regressione

1. toccare `RegistrazioneManualeView.jsx` senza congelare il perimetro puo' rompere il router ancora legacy;
2. il save e' solo parzialmente allineato all'asse canonico, quindi un refactor leggero puo' introdurre incoerenze PN / IVA / partitario;
3. le utility canoniche gia' presenti nel repo possono sembrare il flusso attivo, ma oggi non sono tutte nel path UI reale;
4. `import_fatture` e `import_unificato` sono ancora esposti nell'app e possono confondere il perimetro operativo;
5. il codice legacy `prima_nota_guidata.jsx` esiste ancora e va trattato come riferimento, non come base di sviluppo.

## 12. Primo intervento minimo consigliato

### Fase successiva unica, piu' sicura

**Obiettivo:** congelare il perimetro attivo della manuale nuova e separarlo in modo definitivo dal legacy, senza ancora toccare il contratto di persistenza.

### File da toccare

- `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
- `src/modules/contabilita/views/PrimaNotaHubView.jsx`
- eventualmente `src/modules/contabilita/index.jsx` solo per nomenclatura/tab, non per logica fiscale

### File da NON toccare in quella fase

- `services/primaNotaService.js`
- `src/modules/contabilita/application/persistPrimaNotaDraft.js`
- `src/modules/contabilita/canonical/*`
- `services/accountingCommitService.js`
- `services/registerDocumentoPrimaNotaFromContabilita.js`
- DB/auth/env/migration

### Rischi

- rischio basso se il lavoro resta su UI/router;
- rischio alto se si prova a riallineare tutte le scritture fiscali e il partitario nello stesso task.

### Test consigliati

- verificare il mount della manuale nuova nel tab `prima_nota_guidata`;
- verificare che il router carichi il componente attivo corretto;
- verificare che nessun save reale venga sbloccato accidentalmente.

### Backup / commit prima

- backup non eseguito: task solo audit;
- commit non eseguito: task solo audit.

## 13. Conferma finale

- Nessun codice applicativo e' stato modificato in questo task.
- Nessuna build e' stata eseguita.
- Nessun backup e' stato eseguito.
- Nessun commit e' stato eseguito.

---

# REPORT CODEX - Fase 1A normalizzazione perimetro operativo Registrazione Manuale nuova

Ambito:
- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

Data task:
- `2026-05-23`

## 1. Path effettivamente usato

- Path di lavoro verificato e usato per il task: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- La cartella vecchia `C:\Users\patri\Desktop\fiscosim-viteBACKUP` non e' stata usata.

## 2. Conferma lettura `REGOLE_CODEX.md`

- `REGOLE_CODEX.md` e' stato letto integralmente prima di qualsiasi modifica.
- Vincoli rispettati:
  - nessuna modifica al save/persistenza
  - nessuna modifica a DB/auth/env/migration
  - nessun backup
  - nessun commit
  - un solo report operativo ufficiale aggiornato qui

## 3. File letti

| File | Motivo |
|---|---|
| `REGOLE_CODEX.md` | vincoli operativi |
| `src/modules/contabilita/index.jsx` | menu/tab e meta visibili della manuale nuova |
| `src/modules/contabilita/views/PrimaNotaHubView.jsx` | router che monta la manuale nuova |
| `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | componente attivo della registrazione manuale |
| `src/App.jsx` | verifica presenza di label/route legacy nel routing globale |

## 4. File modificati

| File | Tipo modifica |
|---|---|
| `src/modules/contabilita/index.jsx` | label menu aggiornata e titolo tab normalizzato |
| `src/modules/contabilita/views/PrimaNotaHubView.jsx` | commento tecnico sul mapping legacy -> nuova view |

## 5. Diff sintetico per file

### `src/modules/contabilita/index.jsx`

- label sidebar `prima_nota_guidata` cambiata da `Inserimento manuale` a `Registrazione manuale`
- `CONT_TAB_META.prima_nota_guidata.title` cambiato da `Prima nota guidata` a `Registrazione manuale`
- il routing e la chiave tab sono rimasti invariati

### `src/modules/contabilita/views/PrimaNotaHubView.jsx`

- aggiunto un commento tecnico vicino al branch `prima_nota_guidata`
- il commento chiarisce che la chiave legacy monta `RegistrazioneManualeView`
- nessuna logica di rendering o salvataggio modificata

## 6. Conferma che il save non e' stato toccato

- Confermato.
- Non sono stati modificati:
  - `services/primaNotaService.js`
  - `src/modules/contabilita/application/persistPrimaNotaDraft.js`
  - `src/modules/contabilita/canonical/*`
  - `services/accountingCommitService.js`
  - `services/registerDocumentoPrimaNotaFromContabilita.js`
- Il comportamento di persistenza reale resta invariato.

## 7. Conferma che DB/auth/env/migration non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - `.env`
  - `.env.local`
  - auth
  - access scope
  - DB
  - migration
  - Supabase

## 8. Esito build/test

- `npm run build` eseguito con esito positivo.
- Esito: `PASS`
- Nota build: warning non bloccante sui chunk grandi di Vite, preesistente/estraneo alla modifica UI.

## 9. Rischi regressione

1. rischio minimo sul routing, perche' la chiave `prima_nota_guidata` resta invariata;
2. rischio minimo sulla UI, perche' si tratta solo di label e commento;
3. possibile confusione residua solo se altri punti dell'interfaccia continuano a mostrare la vecchia dicitura legacy;
4. nessun rischio sul salvataggio, perche' non e' stato toccato.

## 10. Primo intervento consigliato

- Prossimo step consigliato: se serve ulteriore chiarezza visiva, fare un audit mirato dei soli testi UI della sezione contabilita per uniformare anche le sottovoci che ancora parlano di `prima_nota_guidata`.
- Non toccare il save fino a quando il perimetro visivo non e' completamente normalizzato.

## 11. BACKUP / COMMIT

- BACKUP NON ESEGUITO: task di sola normalizzazione UI/router.
- COMMIT NON ESEGUITO: task di sola normalizzazione UI/router.

## 12. Conferma finale

- Nessun codice applicativo di persistenza e' stato modificato.
- `REPORT/REPORT_CODEX.md` e' stato aggiornato.

## 13. Commit creato

- Hash commit: `35d5a6c`
- Message: `checkpoint 2026-05-23 - normalizzazione perimetro registrazione manuale`
- File inclusi nel commit:
  - `src/modules/contabilita/index.jsx`
  - `src/modules/contabilita/views/PrimaNotaHubView.jsx`
  - `REPORT/REPORT_CODEX.md`
- Build eseguita prima del commit: `PASS`
- Backup ZIP non eseguito: modifica minima e perimetro ristretto
- Prossimo step consigliato: audit testuale dei testi UI residui che ancora mostrano diciture legacy, senza toccare la persistenza

---

# REPORT CODEX - Audit causali contabili e causali IVA

Ambito:
- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

Data audit:
- `2026-05-23`

## 1. Path effettivamente usato

- Path di lavoro verificato e usato per questo audit: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- La cartella vecchia `C:\Users\patri\Desktop\fiscosim-viteBACKUP` non e' stata usata.

## 2. Conferma lettura `REGOLE_CODEX.md`

- `REGOLE_CODEX.md` e' stato letto integralmente prima di qualunque analisi.
- Vincoli applicati:
  - nessuna modifica a codice applicativo
  - nessuna build
  - nessun backup
  - nessun commit
  - nessuna modifica a DB/auth/env/migration
  - nessun report sparso oltre `REPORT/REPORT_CODEX.md`

## 3. File letti

| File | Ruolo nell'audit |
|---|---|
| `REGOLE_CODEX.md` | regole operative ferree |
| `src/modules/contabilita/views/AnagraficheContabiliView.jsx` | UI impostazioni causali contabili e IVA, salvataggio e form |
| `src/modules/contabilita/data/contabilitaRepo.js` | load/save causali contabili e IVA |
| `src/modules/contabilita/components/causali/CausaleRighePrimaNotaTemplateTab.jsx` | template righe collegati alla causale |
| `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js` | normalizzazione campi causali e template rows |
| `src/modules/contabilita/domain/registrazione/registrazioneCausaleConfig.js` | mappa legacy per codice causale |
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js` | classificazione operazione/causale da campi funzionali e fallback |
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js` | classificazione IVA da campi funzionali |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneCausali.js` | label ed exact match causali |
| `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | utilizzo causale nella manuale nuova |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js` | draft manuale e template rows |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js` | applicazione template righe causale |
| `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneTemplateRowAccount.js` | risoluzione conto riga soggetto/template |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js` | controlli blocco/warning causale, soggetto, righe |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneIvaDraft.js` | controlli causale IVA |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazionePartitarioDraft.js` | controlli partitario |
| `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneRitenutaDraft.js` | controlli ritenute |
| `services/registerDocumentoPrimaNotaFromContabilita.js` | flusso documento contabile con scelta causale legacy FF/FC |
| `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js` | payload canonico manuale e riferimento legacy |
| `supabase/migrations/20260503123000_causali_contabili_config_columns.sql` | colonne causali contabili |
| `supabase/migrations/20260503130000_causali_contabili_righe_template.sql` | template righe causale |
| `supabase/migrations/20260503135500_causali_iva_detail_columns.sql` | colonne causali IVA |
| `supabase/migrations/20260504102000_causali_iva_note_column.sql` | colonna note causali IVA |

## 4. Mappa causali

### Causali contabili

| Area | File principale | Stato |
|---|---|---|
| UI elenco / form | `src/modules/contabilita/views/AnagraficheContabiliView.jsx` | ATTIVA |
| Load/save | `src/modules/contabilita/data/contabilitaRepo.js` | ATTIVO |
| Validazione / normalizzazione | `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js` | ATTIVA |
| Classificazione comportamento | `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js` | ATTIVA |
| Template righe | `src/modules/contabilita/components/causali/CausaleRighePrimaNotaTemplateTab.jsx` | ATTIVO |

### Causali IVA

| Area | File principale | Stato |
|---|---|---|
| UI elenco / form | `src/modules/contabilita/views/AnagraficheContabiliView.jsx` | ATTIVA |
| Load/save | `src/modules/contabilita/data/contabilitaRepo.js` | ATTIVO |
| Validazione / normalizzazione | `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js` | ATTIVA |
| Classificazione IVA | `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js` | ATTIVA |

## 5. Campi disponibili

### Campi causali contabili disponibili oggi

| Campo | Presenza |
|---|---|
| `codice` | SI |
| `descrizione` | SI |
| `descrizione_tabulati` | SI |
| `tipo` | SI |
| `tipo_causale` | SI |
| `operazione_partite` | SI |
| `gestione_partite` | SI |
| `tipo_pagamento` | SI |
| `codice_registro_iva` | SI |
| `protocollo_numerazione` | SI |
| `segno_registro_iva` | SI |
| `codice_aliquota_iva` | SI |
| `op_ritenute` | SI |
| `tipo_documento` | SI |
| `data_documento` | SI |
| `numero_documento` | SI |
| `tipo_doc_comunicaz_ft` | SI |
| `tipo_doc_ft_elettroniche` | SI |
| `conto_iva_esig_differita` | SI |
| `registro_iva_differita` | SI |
| `registro_iva_cee` | SI |
| `protocollo_iva_cee` | SI |
| `segno_iva_registro_cee` | SI |
| `trascina_descrizione` | SI |
| `trascina_sbilancio` | SI |
| `data_competenza` | SI |
| `rateo_risconti` | SI |
| `disattivato` | SI |
| `integrazione_documento` | SI |
| `causale_giro_iva_cassa` | SI |
| `competenza_iva_anno_prec` | SI |
| `causale_standard_efat` | SI |
| `ventilazione_corrispettivi` | SI |
| `esclusa_integrazioni` | SI |
| `note` | SI |
| `righe_prima_nota_template` | SI |

### Campi template riga causale disponibili

| Campo | Presenza |
|---|---|
| `ordine` | SI |
| `ruolo` | SI |
| `hierarchyType` / `hierarchy_type` | SI |
| `isTemplateScope` / `is_template_scope` | SI |
| `lato` | SI |
| `formula_importo` | SI |
| `conto_id` | SI |
| `conto_codice` | SI |
| `conto_descrizione` | SI |
| `mastrino_hint` | SI |
| `descrizione_riga` | SI |
| `obbligatoria` | SI |
| `modificabile` | SI |
| `attiva` | SI |

### Campi causali IVA disponibili oggi

| Campo | Presenza |
|---|---|
| `codice` | SI |
| `descrizione` | SI |
| `aliquota` / `percentuale_imposta` | SI |
| `regime_iva` | SI |
| `percentuale_compensazione` | SI |
| `tipo_trattamento` | SI |
| `nota_di_variazione` | SI |
| `detraibile` | SI |
| `percentuale_indetraibilita` | SI |
| `volume_affari` | SI |
| `volume_affari_plafond` | SI |
| `concorre_plafond` | SI |
| `utilizzo_plafond_interno` | SI |
| `utilizzo_plafond_import` | SI |
| `monte_acquisti` | SI |
| `operazione_attiva` | SI |
| `cessione_intra` | SI |
| `operazione_passiva` | SI |
| `acquisto_intra` | SI |
| `op_attive_spesometro` | SI |
| `op_passive_spesometro` | SI |
| `op_attive_liquidazione` | SI |
| `op_passive_liquidazione` | SI |
| `reverse_charge` | SI |
| `incluso_quadro_vt` | SI |
| `imponibile_quadro_vt` | SI |
| `imposta_quadro_vt` | SI |
| `op_esenti_prorata` | SI |
| `volume_affari_prorata` | SI |
| `ripartizione_acquisti` | SI |
| `no_riparto_spese_acc` | SI |
| `acquisto_soggetti_minimi` | SI |
| `acquisti_art17_c2` | SI |
| `no_calcolo_bolli` | SI |
| `acquisti_regime_forfetario` | SI |
| `oro_argento` | SI |
| `rottami_recupero` | SI |
| `subappalto_edile` | SI |
| `fabbricati_strumentali` | SI |
| `telefoni_cellulari` | SI |
| `prodotti_elettronici` | SI |
| `servizi_pulizia` | SI |
| `demolizione` | SI |
| `installazione_impianti` | SI |
| `completamento_edifici` | SI |
| `trasf_quote` | SI |
| `trasf_unita_certif` | SI |
| `gas_energia` | SI |
| `natura_aliquota_iva_pa` | SI |
| `codice_efat_passive` | SI |
| `codice_efat_attive` | SI |
| `aliquota_ventilazione_no_acq` | SI |
| `note` | SI |

## 6. Dipendenze da codice / nome / descrizione

### Dipendenze ancora presenti

| Punto | Tipo di dipendenza | File |
|---|---|---|
| fallback comportamento causale | codice causale | `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js` -> `resolveRegistrazioneCausaleConfig(code)` |
| fallback legacy per documento/fatture | codice + descrizione con regex | `services/registerDocumentoPrimaNotaFromContabilita.js` -> `pickCausale(...)` con `/FF|fatt.*forn/i` e `/FC|fatt.*cli/i` |
| label causale | codice + descrizione + label | `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneCausali.js` |
| exact match causale | codice + descrizione + label + id | `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneCausali.js` |
| manual registration canonical source meta | stringa legacy `prima_nota_guidata` | `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js` |

### Dipendenza funzionale corretta gia' presente

- `resolveRegistrazioneCausaleBehavior.js` usa prima i campi funzionali:
  - `tipo_causale`
  - `operazione_partite` / `gestione_partite`
  - `op_ritenute`
  - `tipo_documento`
  - `data_documento`
  - `numero_documento`
  - flag IVA/CEE / differita
- il fallback al codice resta solo se i campi funzionali sono assenti o insufficienti.

## 7. Gap impostazioni

### Gap funzionali residui

| Area | Gap attuale |
|---|---|
| documento IVA | esiste come combinazione di `tipo_documento`, `data_documento`, `numero_documento`, `integrazione_documento`, ma non e' ancora un blocco esplicito e completo per tutti i casi fiscali |
| fattura acquisto | oggi dipende ancora da classificazione causale + fallback legacy, non da una policy unica esplicita |
| fattura vendita | come sopra, ancora troppo legata a classificazione e route legacy |
| nota credito | ricavata in parte dal tipo causale / segno IVA, ma non esiste un set di regole unico e dichiarato che la isoli come caso dedicato |
| pagamento/incasso | gestito da `operazione_partite` / `gestione_partite`, ma il confine con documento IVA e con la manuale nuova non e' ancora completamente normalizzato |
| partitario | coperto a livello di draft/validazione, ma i comportamenti di salvataggio e di allineamento non sono ancora unificati in asse canonico |
| ritenute | c'e' `op_ritenute` e il supporto in UI/validator, ma il flusso resta parziale e dipende dal contesto documento |
| IVA per cassa | supportata da campi dedicati (`causale_giro_iva_cassa`, `conto_iva_esig_differita`, `registro_iva_differita`) ma non ancora ricondotta a una policy unica di comportamento |
| split payment | presente come campo IVA e in `regime_iva`, ma non ancora governato da una semantica unica end-to-end |
| reverse charge | presente in causali IVA e behavior, ma ancora dipendente da classificazione e configurazione sparse |

## 8. Primo intervento minimo consigliato

### Intervento piu' sicuro

1. consolidare un **contratto unico di causale** per contabile e IVA che parta dai campi funzionali dell'anagrafica e non dal nome/codice;
2. usare quel contratto in:
   - `resolveRegistrazioneCausaleBehavior.js`
   - `resolveRegistrazioneCausaleIvaBehavior.js`
   - `RegistrazioneManualeView.jsx`
   - `AnagraficheContabiliView.jsx`
3. lasciare il fallback da codice solo come ultima risorsa, senza usarlo come fonte primaria di comportamento.

### File da toccare in fase successiva

- `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js`
- `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/views/RegistrazioneManualeView.jsx`

### File da non toccare in quella fase

- `services/primaNotaService.js`
- `src/modules/contabilita/application/persistPrimaNotaDraft.js`
- `src/modules/contabilita/canonical/*`
- DB/auth/env/migration

## 9. Rischi

1. se si continua a classificare per nome/codice si tengono in vita comportamenti legacy non controllati;
2. se si allargano insieme anagrafiche, manuale e salvataggio, aumenta il rischio di regressione su FF/FC/RP/PF/IC;
3. `documenti_import` e `prima_nota_guidata` sono ancora presenti nel perimetro e possono confondere la lettura del flusso;
4. i template righe causale sono potenti ma possono mascherare la mancanza di configurazione esplicita se non vengono normalizzati con attenzione.

## 10. Test consigliati

- non eseguire build o test in questo audit, perche' task solo analisi;
- nel prossimo intervento tecnico:
  - `npm run build`
  - test manuale FF/FC
  - test manuale PD semplice
  - test regressione PF/IC

## 11. BACKUP / COMMIT

- BACKUP NON ESEGUITO: task solo audit.
- COMMIT NON ESEGUITO: task solo audit.

## 12. Conferma finale

- Nessun codice applicativo e' stato modificato in questo task.
- `REPORT/REPORT_CODEX.md` e' stato aggiornato con il report richiesto.

---

# REPORT CODEX - Fase RM1A contratto unico comportamento causale

Ambito:
- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

Data task:
- `2026-05-23`

## 1. Path effettivamente usato

- Path di lavoro verificato e usato: `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`
- La cartella vecchia `C:\Users\patri\Desktop\fiscosim-viteBACKUP` non e' stata usata.

## 2. Conferma lettura `REGOLE_CODEX.md`

- `REGOLE_CODEX.md` letto integralmente prima del lavoro.
- Vincoli rispettati:
  - nessuna modifica al save
  - nessuna modifica a DB/auth/env/migration
  - nessun backup
  - nessun commit
  - nessun refactor massivo

## 3. File letti

| File | Ruolo |
|---|---|
| `REGOLE_CODEX.md` | regole operative |
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js` | resolver contabile esistente |
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js` | resolver IVA esistente |
| `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js` | campi funzionali e normalizzazione causali |
| `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js` | uso del behavior nella manuale nuova |
| `src/modules/contabilita/views/RegistrazioneManualeView.jsx` | utilizzo causale nella UI attiva |
| `src/modules/contabilita/views/AnagraficheContabiliView.jsx` | UI gestione causali |
| `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js` | test behavior/registrazione |
| `src/modules/contabilita/application/persistPrimaNotaDraft.test.js` | test persistenza non toccata |
| `src/modules/contabilita/application/buildContabilitaPostPersistOutput.test.js` | test output post persist |
| `src/modules/contabilita/application/canonicalContabilitaDraftMapper.test.js` | test mapper draft |

## 4. File creati

| File | Scopo |
|---|---|
| `src/modules/contabilita/domain/causali/causalePolicyUtils.js` | helper puri condivisi per lettura campi funzionali |
| `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js` | contratto unico policy per causale contabile |
| `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js` | contratto unico policy per causale IVA |

## 5. File modificati

| File | Scopo modifica |
|---|---|
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js` | ora usa la policy contabile come fonte primaria |
| `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js` | ora usa la policy IVA come fonte primaria |
| `REPORT/REPORT_CODEX.md` | aggiornamento report |

## 6. Diff sintetico

### `buildCausaleContabilePolicy.js`

- introdotta una funzione pura che legge la causale contabile dai campi funzionali gia' esistenti
- espone indicatori chiari:
  - `isDocumentoIva`
  - `isMovimentoGenerico`
  - `isPagamentoIncasso`
  - `gestionePartitario`
  - `gestioneRitenute`
  - `richiedeDataDocumento`
  - `richiedeNumeroDocumento`
  - `registroIva`
  - `segnoRegistroIva`
  - `ivaPerCassa`
  - `splitPayment`
  - `reverseCharge`
  - `notaCredito`
  - `integrazioneDocumento`

### `buildCausaleIvaPolicy.js`

- introdotta una funzione pura che costruisce una policy IVA coerente
- usa la causale IVA e, se disponibile, la policy contabile gia' risolta
- centralizza:
  - `registroIva`
  - `segnoRegistroIva`
  - `ivaMode`
  - `detraibilita`
  - `splitPayment`
  - `reverseCharge`
  - `notaCredito`

### `resolveRegistrazioneCausaleBehavior.js`

- il resolver non classifica piu' direttamente leggendo in proprio tutti i campi
- usa `buildCausaleContabilePolicy(...)` come fonte primaria
- il fallback legacy da codice resta, ma solo come fallback finale esplicito e commentato

### `resolveRegistrazioneCausaleIvaBehavior.js`

- il resolver IVA usa `buildCausaleIvaPolicy(...)`
- continua a restituire la stessa shape pubblica usata dalla Registrazione Manuale

## 7. Conferma su codici/nomi NES

- Confermato: nessun nome o codice causale NES e' stato cambiato.
- Il fallback legacy per codici storici resta disponibile come ultima risorsa.

## 8. Conferma che il save non e' stato toccato

- Confermato.
- Non sono stati modificati:
  - `services/primaNotaService.js`
  - `src/modules/contabilita/application/persistPrimaNotaDraft.js`
  - `services/accountingCommitService.js`
  - `services/registerDocumentoPrimaNotaFromContabilita.js`
  - moduli di persistenza o contratto di save

## 9. Conferma che DB/auth/env/migration non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

## 10. Esito build/test

- `npm run build`: PASS
- warning non bloccante Vite sui chunk grandi: preesistente / fuori perimetro
- test eseguiti:
  - `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js src/modules/contabilita/application/persistPrimaNotaDraft.test.js src/modules/contabilita/application/buildContabilitaPostPersistOutput.test.js src/modules/contabilita/application/canonicalContabilitaDraftMapper.test.js`
- esito test: PASS
  - 92 test passati
  - 0 falliti

## 11. Rischi regressione

1. il contratto nuovo e' introdotto solo nei resolver, quindi altri flussi legacy esterni possono continuare a usare nome/codice finche' non vengono riallineati;
2. `services/registerDocumentoPrimaNotaFromContabilita.js` continua a scegliere FF/FC con regex su codice/descrizione;
3. i campi funzionali esistono, ma non tutte le causali storiche potrebbero essere compilate in modo completo, quindi il fallback legacy restera' ancora visibile su alcune anagrafiche.

## 12. Prossimo step consigliato

- Prossimo step unico e sicuro: riallineare il flusso documento-guidato che oggi usa `pickCausale(...)` in `services/registerDocumentoPrimaNotaFromContabilita.js`, facendolo leggere la nuova policy invece del nome/codice causale.

## 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO: modifica piccola e perimetro controllato.
- COMMIT NON ESEGUITO.

## 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato.
