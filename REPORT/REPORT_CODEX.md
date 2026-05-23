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
