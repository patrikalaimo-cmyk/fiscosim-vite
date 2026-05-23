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

- Hash commit creato: `ccf60af` (`checkpoint 2026-05-23 - contratto unico comportamento causali`)
- File inclusi nel commit:
  - `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
  - `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
  - `src/modules/contabilita/domain/causali/causalePolicyUtils.js`
  - `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js`
  - `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js`
  - `REPORT/REPORT_CODEX.md`
- Conferma build/test precedenti: PASS.
- BACKUP NON ESEGUITO: diff limitato ai file attesi, checkpoint piccolo e controllato.
- COMMIT ESEGUITO: checkpoint creato con successo.

## 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato.

---

## RM1B - Impostazioni causali contabili piu' guidate

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: le regole operative sono state lette prima dell'intervento.

### 3. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/domain/causali/causalePolicyUtils.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`

### 4. File creati

- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`

### 5. File modificati

- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`

### 6. Diff sintetico

- introdotto un helper piccolo dedicato al contratto unico del sottotipo operativo causale;
- la form causali ora mostra `Operazione gestita` al posto di `Tipo documento`;
- le opzioni sono filtrate in base al `tipo_causale`:
  - movimento generale: `Generale`, `Incasso`, `Pagamento`
  - doc. IVA normale: `Fattura attiva`, `Fattura passiva`, `Nota credito attiva`, `Nota credito passiva`
  - doc. IVA esig. differita: `Fattura attiva IVA per cassa`, `Fattura passiva IVA per cassa`
  - pag./inc. IVA esig. diff.: `Incasso IVA per cassa`, `Pagamento IVA per cassa`
  - autofattura: `Autofattura`, `Reverse charge`, `Integrazione documento`
  - corrispettivo: `Corrispettivo`
  - IVA Acq. CEE: `Acquisto CEE beni`, `Acquisto CEE servizi`
  - sola IVA: `Movimento sola IVA`
- la policy contabile/IVA legge il sottotipo operativo come campo funzionale, mantenendo il fallback legacy solo come compatibilita' residua;
- la normalizzazione del form preserva i valori legacy non ancora mappati, con fallback visivo in UI, senza toccare il save.

### 7. Conferma su codici/nomi causali NES

- Confermato: nessun codice o nome causale NES e' stato cambiato.

### 8. Conferma che save/DB/migration/auth/env non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - save
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

### 9. Esito build/test

- `npm run build`: PASS
- test mirato eseguito:
  - `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- esito test: PASS
  - 86 test passati
  - 0 falliti

### 10. Rischi regressione

1. i valori legacy gia' memorizzati possono apparire come fallback testuale finche' non vengono riallineati manualmente o da una successiva migrazione controllata;
2. il nuovo mapping rende piu' esplicito il comportamento, ma il resto del flusso contabile continua a dipendere dai campi funzionali gia' esistenti (`operazione_partite`, `op_ritenute`, `data_documento`, `numero_documento`).

### 11. Test manuali consigliati

- aprire una causale contabile nuova e verificare che `Operazione gestita` mostri solo le scelte consentite dal `tipo_causale`;
- cambiare `tipo_causale` e verificare che il valore dell'operazione si resetti o si riallinei senza salvare dati incoerenti;
- riaprire una causale legacy gia' esistente e verificare che il valore non compatibile venga mostrato come fallback e non venga perso al salvataggio.

### 12. Prossimo step consigliato

- Agganciare il comportamento della nuova policy al flusso documento-guidato che oggi usa ancora la selezione legacy per `FF`/`FC`, in modo da far leggere la policy causale anche all'import/registrazione documento.

### 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

### 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1B.

---

## RM1B-bis - filtro Operazione gestita dipendente da tipo causale + gestione partite

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: `REGOLE_CODEX.md` e' stato letto integralmente prima dell'intervento.

### 3. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`

### 4. File modificati

- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `REPORT/REPORT_CODEX.md`

### 5. Diff sintetico

- il gruppo `Movimento di generale` e' stato spezzato in due comportamenti:
  - `Ignora` / non chiude partite: scrittura semplice di prima nota con opzioni `Generale`, `Giroconto`, `Costo/Ricavo diretto`
  - `Chiude`: incasso/pagamento ordinario con opzioni `Incasso`, `Pagamento`
- il filtro `Operazione gestita` ora usa il contesto combinato `tipo_causale + gestione_partite/operazione_partite`;
- se il valore corrente non e' piu' coerente con il contesto, la UI lo riallinea o lo resetta; i valori legacy non mappati restano visibili come fallback testuale e non vengono persi automaticamente;
- la policy contabile ora distingue esplicitamente il caso `Movimento di generale + Chiude` dal canale `Pag./Inc. IVA esig. diff.`;
- la normalizzazione del form causale usa il contesto partite per non generare combinazioni incoerenti.

### 6. Conferma su Operazione gestita

- Confermato: `Operazione gestita` dipende ora da `tipo_causale + gestione_partite/operazione_partite`.

### 7. Conferma su Movimento generale + Chiude

- Confermato: `Movimento di generale + Chiude` e' trattato come incasso/pagamento ordinario, non come IVA per cassa.

### 8. Conferma su Pag./Inc. IVA esig. diff.

- Confermato: `Pag./Inc. IVA esig. diff.` resta il solo canale dedicato per incasso/pagamento IVA per cassa.

### 9. Conferma che save/DB/migration/auth/env non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - save
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

### 10. Esito build/test

- `npm run build`: PASS
- test mirato eseguito:
  - `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- esito test: PASS
  - 86 test passati
  - 0 falliti

### 11. Test manuali consigliati

- aprire una causale `Movimento di generale` con `Ignora` e verificare che il menu `Operazione gestita` mostri solo le scelte di scrittura semplice;
- cambiare `gestione_partite` su `Chiude` e verificare che il menu si restringa alle sole opzioni `Incasso` / `Pagamento`;
- aprire una causale `Pag./Inc. IVA esig. diff.` e verificare che restino solo le opzioni IVA per cassa;
- cambiare contesto e verificare che un valore non piu' coerente venga riallineato senza perdere i fallback legacy non mappati.

### 12. Prossimo step consigliato

- Agganciare il nuovo filtro contestuale anche ai punti di lettura della causale fuori dalla schermata impostazioni, in modo che il comportamento resti coerente nella Registrazione Manuale e nei flussi documento-guidati.

### 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

### 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1B-bis.

---

## RM1B-ter - fix salvataggio impostazioni causali contabili / Operazione gestita

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: `REGOLE_CODEX.md` e' stato letto integralmente prima dell'intervento.

### 3. Causa del mancato salvataggio

- il payload di salvataggio della causale stava includendo anche `gestione_partite`, ma nel DB delle causali contabili non esiste una colonna persistita con questo nome;
- la UI mostrava correttamente il comportamento filtrato, ma il dato reale da salvare doveva restare nel campo DB esistente `operazione_partite` e il sottotipo operativo in `tipo_documento`;
- di conseguenza, il reload non poteva garantire coerenza se il payload conteneva un campo non persistibile o non riallineato al campo reale.

### 4. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/data/contabilitaRepo.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `supabase/migrations/20260503123000_causali_contabili_config_columns.sql`

### 5. File modificati

- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `REPORT/REPORT_CODEX.md`

### 6. Diff sintetico

- il form causali continua a filtrare `Operazione gestita` in base a `tipo_causale` + partite;
- i due campi partite vengono ora riallineati in UI durante la modifica, cosi' il valore effettivo non diverge tra alias legacy e campo attivo;
- il payload di salvataggio non invia piu' `gestione_partite` al repository, ma persiste il valore nel campo reale `operazione_partite`;
- il reload continua a ricostruire anche `gestione_partite` come alias di UI a partire dal valore salvato;
- il test mirato e' stato aggiornato per verificare che il valore venga salvato nel campo corretto e che il campo alias non finisca nel payload DB.

### 7. Conferma sul campo corretto

- Confermato: `Operazione gestita` continua a essere salvato nel campo corretto `tipo_documento`.
- Confermato: il valore di contesto partite viene ora persistito nel campo DB reale `operazione_partite`, senza inviare una colonna inesistente.

### 8. Conferma reload

- Confermato: il reload mantiene il valore salvato perche' la normalizzazione ricostruisce `gestione_partite` come alias a partire da `operazione_partite` e normalizza `tipo_documento` nello stesso contratto funzionale.

### 9. Conferma che save Registrazione Manuale / DB / migration / auth / env non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - save della Registrazione Manuale
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

### 10. Esito build/test

- `npm run build`: PASS
- test mirato eseguito:
  - `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- esito test: PASS
  - 86 test passati
  - 0 falliti

### 11. Test manuali consigliati

- aprire una causale contabile esistente, modificare `Operazione gestita`, salvare, chiudere e riaprire la causale verificando che il valore resti quello scelto;
- cambiare `Operazione partite` / `Gestione partite` e verificare che il valore persistito torni nel campo reale `operazione_partite`;
- controllare che il filtro di `Operazione gestita` resti coerente dopo il reload e non mostri piu' combinazioni non compatibili.

### 12. Prossimo step consigliato

- Se il comportamento risulta stabile in UI, il prossimo step sicuro e' lasciare fermo questo contratto e applicarlo solo ai flussi che leggono le causali, senza riaprire il save della Registrazione Manuale.

### 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

### 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1B-ter.

---

## RM1B-quater - debug mirato salvataggio e refresh impostazioni causali

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: `REGOLE_CODEX.md` e' stato letto integralmente prima dell'intervento.

### 3. Causa reale del bug su `Operazione gestita`

- il salvataggio aggiornava correttamente il record, ma la riapertura del modal leggeva ancora la causale da uno stato/lista locale non rifrescato;
- in pratica il refresh visivo richiedeva un hard reset della pagina per mostrare il valore persistito piu' recente;
- la correzione introdotta forza il refetch del record prima dell'apertura del modal e attende il refresh della lista dopo il save, cosi' il modal riparte dal dato realmente salvato.

### 4. Causa reale del bug su `Gestione partite`

- `Gestione partite` e `operazione_partite` stavano oscillando come alias UI/persistenza senza un allineamento stabile;
- la UI mostrava `gestione_partite` come comando operativo, ma il campo realmente persistito e' `operazione_partite`;
- il problema di blocco su `Chiude` dipendeva dalla mancata sincronizzazione costante tra i due campi in fase di edit e reload.

### 5. Flusso dati ricostruito

- UI causale:
  - selezione in `Operazione gestita` / `Gestione partite`
  - aggiornamento stato form
  - normalizzazione `tipo_documento` tramite policy causale
- salvataggio:
  - `AnagraficheContabiliView.jsx` costruisce il payload con `buildRegistrazioneCausaleContabilePayload(...)`
  - `contabilitaRepo.updateCausale(...)` persiste il record
  - il refresh lista viene atteso prima di chiudere il modal
- reload:
  - `openEditCausale(...)` rifetcha il record per `id`
  - `hydrateRegistrazioneCausaleContabileForm(...)` ricostruisce `gestione_partite` dal valore persistito
- sincronizzazione partite:
  - il cambio UI aggiorna entrambi i campi:
    - `gestione_partite`
    - `operazione_partite`
  - il payload persiste il campo reale DB `operazione_partite`

### 6. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/data/contabilitaRepo.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `supabase/migrations/20260503123000_causali_contabili_config_columns.sql` (solo lettura)

### 7. File modificati

- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `REPORT/REPORT_CODEX.md`

### 8. Diff sintetico

- la finestra edit causale ora rifetcha il record dal repository prima di aprirsi;
- dopo il save la lista causali viene rifrescata prima della chiusura del modal;
- `Gestione partite` e `operazione_partite` vengono tenuti sincronizzati nello stato form;
- il payload continua a persistere il valore nel campo DB reale `operazione_partite`;
- la normalizzazione al reload ricostruisce `gestione_partite` dal dato persistito;
- e' stato aggiunto un test mirato sulla sincronizzazione `gestione_partite -> operazione_partite` e sulla normalizzazione del reload.

### 9. Conferma su `Operazione gestita`

- Confermato: dopo save + chiudi/riapri la UI ora ricarica i valori aggiornati senza hard reset.

### 10. Conferma su `Gestione partite`

- Confermato: `gestione_partite` e `operazione_partite` non divergono piu' nel flusso di edit/reload; il valore persistito resta coerente dopo il salvataggio.

### 11. Conferma che save Registrazione Manuale / DB / migration / auth / env non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - save della Registrazione Manuale
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

### 12. Esito build/test

- `npm run build`: PASS
- test mirato eseguito:
  - `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- esito test: PASS
  - 87 test passati
  - 0 falliti

### 13. Test manuali richiesti

- modificare `Operazione gestita`, salvare, chiudere e riaprire la causale senza hard reset;
- cambiare `Gestione partite` da `Chiude` a `Ignora` e viceversa, verificando che il valore persista e venga riletto correttamente;
- fare un cambio rapido di `tipo_causale` e verificare che il filtro di `Operazione gestita` si riallinei al nuovo contesto.

### 14. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

### 15. Prossimo step consigliato

- Se la UI conferma il refresh corretto, il prossimo passo e' applicare la stessa logica di refetch/riapertura solo ai punti che leggono la causale in altri moduli, senza riaprire il salvataggio della Registrazione Manuale.

### 16. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1B-quater.

---

## RM1B-quinquies - rimozione ambiguita' Gestione partite dalle impostazioni causali

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: `REGOLE_CODEX.md` e' stato letto integralmente prima dell'intervento.

### 3. Causa residua del problema su `gestione_partite`

- `gestione_partite` era rimasto come secondo input editabile nella UI causali, pur non essendo il campo operativo principale;
- questa doppia esposizione generava ambiguita' tra alias UI e campo persistito reale;
- la correzione elimina il controllo editabile autonomo e usa solo `operazione_partite` come comando principale, mantenendo `gestione_partite` come alias interno derivato.

### 4. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/causalePolicyUtils.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`

### 5. File modificati

- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `REPORT/REPORT_CODEX.md`

### 6. Diff sintetico

- nella UI causali e' stato rimosso il campo editabile autonomo `Gestione partite`;
- il singolo campo visibile e' ora `Gestione partite`, ma tecnicamente scrive su `operazione_partite` e riallinea `gestione_partite` come alias interno;
- la policy causale usa `operazione_partite` come fonte primaria e solo in fallback il vecchio alias;
- la normalizzazione al reload ricostruisce `gestione_partite` a partire da `operazione_partite`;
- i test sono stati aggiornati per verificare la priorita' della fonte primaria e l'assenza di divergenza.

### 7. Conferma che `operazione_partite` e' ora la fonte primaria

- Confermato: il flusso di UI, normalizzazione e policy usa `operazione_partite` come comando principale.

### 8. Conferma che `gestione_partite` non e' piu' campo editabile autonomo

- Confermato: non esiste piu' un secondo input editabile separato in UI; `gestione_partite` resta solo alias derivato/compatibilita'.

### 9. Conferma che `Operazione gestita` continua a funzionare

- Confermato: il filtro di `Operazione gestita` continua a funzionare e a dipendere dal contesto `tipo_causale + operazione_partite`.

### 10. Conferma che save Registrazione Manuale / DB / migration / auth / env non sono stati toccati

- Confermato.
- Nessuna modifica a:
  - save della Registrazione Manuale
  - DB
  - migration
  - auth
  - `.env`
  - `.env.local`
  - Supabase

### 11. Esito build/test

- `npm run build`: PASS
- `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`: PASS
  - 88 test passati
  - 0 falliti

### 12. Test manuali richiesti

- aprire una causale contabile e verificare che esista un solo controllo editabile per la gestione partite;
- cambiare il valore della gestione partite e verificare che la riapertura mostri il dato persistito senza ambiguita';
- cambiare `tipo_causale` e verificare che il menu `Operazione gestita` continui a filtrare correttamente.

### 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT ESEGUITO: `e298e3b` (`checkpoint 2026-05-23 - impostazioni causali guidate e partite`)
- File inclusi nel commit:
  - `REPORT/REPORT_CODEX.md`
  - `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
  - `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
  - `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
  - `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
  - `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- Build/test: PASS.
- Test manuale utente: PASS (conferma operativa su `Operazione gestita` e `Gestione partite`).

### 14. Prossimo step consigliato

- Se la UI e il reload restano coerenti, il prossimo passo e' mantenere questo contratto stabile e applicarlo solo ai flussi che leggono le causali, senza riaprire il salvataggio della Registrazione Manuale.

### 15. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1B-quinquies.

---

## RM1C - audit strutturale causali contabili/IVA dopo RM1B

### 1. Path usato

- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

### 2. Conferma lettura REGOLE_CODEX.md

- Confermato: `REGOLE_CODEX.md` e' stato letto integralmente prima dell'audit.

### 3. File letti

- `REGOLE_CODEX.md`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/domain/causali/causaleOperazioneGestita.js`
- `src/modules/contabilita/domain/causali/causalePolicyUtils.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`
- `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js`
- `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleIvaBehavior.js`
- `src/modules/contabilita/prima_nota_guidata.jsx`
- `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
- `src/modules/contabilita/views/PrimaNotaHubView.jsx`
- `src/modules/contabilita/index.jsx`
- `src/modules/contabilita/data/contabilitaRepo.js`

### 4. Valutazione fonte primaria causali

- Confermato: la struttura causale usa ora impostazioni funzionali come fonte primaria:
  - `tipo_causale`
  - `tipo_documento` / `Operazione gestita`
  - `operazione_partite`
  - `op_ritenute`
  - registri IVA e flag IVA
- Confermato: `operazione_partite` e' la fonte primaria per le partite.
- Confermato: `gestione_partite` e' rimasto solo come alias interno/compatibilita'.

### 5. Dipendenze fragili trovate

- `resolveRegistrazioneCausaleBehavior.js` mantiene ancora un fallback legacy finale basato sul codice quando i metadati funzionali non bastano;
- `PrimaNotaHubView.jsx` contiene ancora la mappa storica `CAUSALI_APRONO_PARTITA` con codici espliciti (`FF`, `FC`, `RP`, ecc.);
- `AnagraficheContabiliView.jsx` conserva riferimenti funzionali e di import ancora legati a codici storici nei punti di ingestione documentale;
- `causaleOperazioneGestita.js` mantiene un fallback di mapping legacy da testi/codici storici per non perdere valori gia' esistenti;
- `prima_nota_guidata.jsx` esiste ancora come file legacy molto grande e viene mantenuto come chiave/rimando storico, non come flusso nuovo;
- `contabilitaRepo.js` e' ancora molto ampio e contiene logica multi-flusso oltre al solo perimetro causali.

### 6. Fallback legacy residui

- fallback al codice in `resolveRegistrazioneCausaleBehavior.js` quando il profilo funzionale non e' sufficiente;
- fallback lessicale/legacy in `causaleOperazioneGestita.js` per riconoscere valori storici gia' presenti;
- chiave routing legacy `prima_nota_guidata` in `index.jsx` e `PrimaNotaHubView.jsx`;
- commento esplicito nel hub che indica il montaggio della nuova `RegistrazioneManualeView` tramite chiave legacy temporanea.

### 7. Valutazione modularita'

- Valutazione: **abbastanza forte ma con debiti**.
- Punti forti:
  - policy causali separate in `domain/causali`;
  - normalizzazione separata in `domain/registrazione`;
  - UI impostazioni causali e UI manuale distinte;
  - registrazione manuale nuova separata dal legacy.
- Debiti:
  - `AnagraficheContabiliView.jsx` e' ancora molto grande e concentra molta UI;
  - `contabilitaRepo.js` e' molto grande e incorpora piu' responsabilita';
  - `prima_nota_guidata.jsx` resta pesante e va considerato solo come legacy di riferimento;
  - alcuni flussi di lettura continuano a dipendere da mapping storici per non rompere i dati gia' presenti.

### 8. Valutazione coerenza fiscale/contabile

- La struttura attuale e' sufficiente a governare:
  - scrittura semplice PN
  - fattura attiva / passiva
  - note credito attive / passive
  - incasso / pagamento ordinario
  - IVA per cassa / esigibilita' differita
  - split payment
  - reverse charge / autofattura
  - corrispettivi
  - ritenute
  - partitario
  - registri IVA
  - template righe PN
- Restano pero' punti che richiedono disciplina funzionale costante:
  - la distinzione tra alias UI e campo persistito reale;
  - i fallback legacy per i casi storici;
  - l'allineamento tra comportamento causale, documento e flusso di registrazione.

### 9. Rischi regressione

1. una riduzione troppo aggressiva dei fallback legacy potrebbe rompere le causali storiche gia' salvate;
2. la presenza di mappe storico-codice in alcuni punti UI/documento puo' reintrodurre ambiguita' se non viene tenuta sotto controllo;
3. `contabilitaRepo.js` e `AnagraficheContabiliView.jsx` restano grandi e quindi piu' sensibili a regressioni a cascata;
4. i flussi legacy e la chiave `prima_nota_guidata` vanno tenuti come compatibilita' e non riutilizzati come fonte di nuova logica.

### 10. Zone d'ombra

- `prima_nota_guidata` e' ancora presente come chiave legacy ma il confine tra semplice compatibilita' e flusso attivo va tenuto sotto controllo;
- i fallback legacy da codice e testo esistono ancora e vanno chiariti caso per caso se diventano troppo permissivi;
- il perimetro di `operazione_partite` come fonte primaria e' ormai definito, ma bisogna evitare di reintrodurre `gestione_partite` come input editabile autonomo;
- alcuni casi storici di causali potrebbero richiedere conferma fiscale/contabile esplicita dall'utente per essere normalizzati senza ambiguita'.

### 11. Primo prossimo step consigliato

- Congelare il contratto causali corrente e applicarlo solo ai flussi lettori della manuale/documento, tenendo fuori il legacy dalla nuova logica di salvataggio e di scelta operativa.

### 12. Conferma nessun codice modificato

- Confermato: nessun codice applicativo e' stato modificato in questo audit.

### 13. BACKUP / COMMIT

- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

### 14. Conferma finale

- `REPORT/REPORT_CODEX.md` e' stato aggiornato anche per RM1C.

---

## RM2A - Policy causale per testata e tab della Registrazione Manuale

**Path usato**
- `C:\Users\patri\Desktop\fiscosim-viteBACKUP - Copia1205`

**Conferma lettura `REGOLE_CODEX.md`**
- letta integralmente prima di intervenire.

**File letti**
- `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
- `src/modules/contabilita/components/registrazione/RegistrazioneHeaderForm.jsx`
- `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`
- `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `src/modules/contabilita/domain/registrazione/resolveRegistrazioneCausaleBehavior.js`
- `src/modules/contabilita/domain/causali/buildCausaleContabilePolicy.js`
- `src/modules/contabilita/domain/causali/buildCausaleIvaPolicy.js`
- `src/modules/contabilita/domain/registrazione/normalizeRegistrazioneCausaleDetail.js`

**File creati**
- `src/modules/contabilita/domain/registrazione/buildRegistrazioneManualeUiPolicy.js`

**File modificati**
- `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
- `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js`
- `src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`
- `REPORT/REPORT_CODEX.md`

**Diff sintetico**
- introdotto un helper UI dedicato alla policy causale per guidare visibilita' e obbligatorieta' dei campi della manuale;
- la Registrazione Manuale usa ora la policy derivata per decidere tab visibili e testata mostrata/obbligatoria;
- la validazione draft usa la stessa policy UI come fonte dei campi obbligatori di testata;
- aggiunti test mirati sulla policy UI per documento IVA, movimento generale semplice e movimento generale in chiusura con ritenute.

**Conferme funzionali**
- la UI usa la policy causale e non codici/nome causale come fonte decisionale primaria;
- `operazione_partite` resta la fonte primaria per la gestione partite;
- `save` della Registrazione Manuale non e' stato toccato;
- DB / migration / auth / env / Supabase non sono stati toccati.

**Esito build/test**
- `npm run build`: PASS
- `node --test src/modules/contabilita/application/registrazioneOperations/registrazioneOperations.test.js`: PASS, `91/91`

**Test manuali richiesti**
- verificare una causale documento IVA e confermare che compaiano Data documento, Numero documento, Cliente/Fornitore e Totale documento;
- verificare un movimento generale semplice e confermare che non compaiano partitario e ritenute;
- verificare un movimento generale con chiusura partite e confermare la visibilita' del partitario e delle ritenute se abilitate;
- verificare che il cambio causale faccia ricalcolare i tab visibili senza dipendere da FF/FC/RP come logica diretta.

**Valutazione strutturale**
- la modifica **rafforza** il modulo perche' introduce un contratto UI dedicato e centralizzato;
- non introduce dipendenze fragili nuove, ma continua a dipendere dal fallback legacy gia' presente nel resolver causale;
- non crea duplicazioni nuove: normalizza l'uso della policy gia' esistente;
- non appesantisce in modo significativo i file principali, perche' la logica nuova e' stata spostata in un helper piccolo;
- i rischi di rottura a cascata restano contenuti ma esistono sui casi legacy che ancora passano dal fallback codice/testo;
- in una fase futura sara' utile un hardening ulteriore per ridurre i fallback legacy residui.

**Rischi residui**
- alcune causali storiche potrebbero continuare a dipendere dal fallback legacy se i metadati funzionali non sono completi;
- la semantica di ritenute/documento per casi ibridi resta delicata e potrebbe richiedere chiarimento funzionale ulteriore;
- la UI della manuale continua a ricevere una policy derivata: se il resolver legacy torna ad essere necessario su piu' casi, va monitorata la coerenza dei tab.

**Primo prossimo step consigliato**
- usare la stessa policy UI per rifinire i casi ibridi del flusso documento/partite/ritenute, mantenendo il legacy solo come compatibilita' residua.

**BACKUP / COMMIT**
- BACKUP NON ESEGUITO.
- COMMIT NON ESEGUITO.

**Conferma finale**
- `REPORT/REPORT_CODEX.md` aggiornato anche per RM2A.
