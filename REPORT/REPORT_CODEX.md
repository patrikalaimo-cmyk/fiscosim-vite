# ROADMAP-STUDIO-GRADE-INTEGRAZIONE-FISCALE-CONTABILE

Path verificato prima dell'attivita:
- `C:\Users\patri\Desktop\fiscosim-viteBACKUPAntigravity`

File modificati in questa attivita:
- `REPORT/ROADMAP_FISCOSIM_STUDIO_GRADE.md`
- `REPORT/REPORT_CODEX.md`

Conferma importante:
- nessun codice applicativo modificato;
- nessun file DB, migration, Supabase, auth o env toccato;
- nessun refactor;
- nessuna nuova roadmap parallela creata.

Sezioni aggiunte o corrette nella roadmap:
- `0. Audit critico della roadmap attuale`
- `Split payment`
- `IVA per cassa`
- `Reverse charge, acquisti UE/extra UE e autofatture estere`
- `Ritenute, percipienti, CU, 770 e F24`
- `Regimi contabili gestiti`
- `Stampe, registri e output definitivi`
- `Bilancio, situazioni e chiusura esercizio`
- `Cespiti e ammortamenti`
- `Gestione modifiche, annulli, storni e cancellazioni`
- `Impostazioni personalizzabili ma controllate`
- `Matrice fiscale-contabile corretta`
- `Roadmap rigida per fasi`
- `Test suite finale`
- `Criterio 100% studio-grade`

Principali aree rese piu dettagliate:
- split payment come caso attivo cliente con flag e effetto specifico su registri, liquidazione e partitario;
- IVA per cassa come ciclo documento -> partita -> incasso/pagamento;
- reverse charge, acquisti UE/extra UE e autofatture estere come casi distinti con doppia rilevazione e registri coerenti;
- ritenute, percipienti, CU, 770 e F24 come flusso unico da parcella a adempimento;
- stampe e output definitivi con distinzione tra provvisorio, definitivo e blocco;
- bilancio, situazioni, chiusure e riaperture con audit e periodo chiuso;
- cespiti e ammortamenti come sottosistema completo;
- modifiche, annulli, storni e cancellazioni con workflow controllato;
- matrice fiscale-contabile piu rigida, con casi concreti e test minimi;
- roadmap per fasi piu frammentata e quindi piu eseguibile.

Rischi residui:
- alcune aree restano da allineare sul codice reale, soprattutto dove il report indica che il legacy deve essere solo migrato o isolato;
- split payment, IVA per cassa, reverse charge e ritenute richiederanno verifica successiva sul comportamento effettivo del repository e dei validator;
- la roadmap e ora piu rigida, ma restano necessari riscontri tecnici su persistence, audit e report per ogni fase.

Prossimi step consigliati:
1. validare la roadmap con il team commerciale/fiscale per i casi split, IVA per cassa, reverse charge e ritenute;
2. usare la FASE 0 per mappare concretamente i riferimenti legacy ancora presenti nel codice;
3. partire dalla FASE 1 e FASE 2 per congelare contratto canonico e save atomico del nucleo semplice;
4. aggiungere la suite minima di test fiscali italiani prima di estendere le fasi piu complesse.

Punti da validare con il commercialista o con l'utente:
- trattamento dello split payment sulla partita cliente;
- regola di esigibilita per IVA per cassa e gestione del residuo;
- classificazione interna di reverse charge, acquisti UE/extra UE e autofatture;
- perimetro forfettari/minimi se previsti come anagrafiche o documenti senza IVA ordinaria;
- modalita di blocco delle stampe definitive e di riapertura solo Admin/Owner.

Test eseguiti in questa attività:
- verifica del path reale prima di qualsiasi modifica;
- controllo e riscrittura dei due soli file di report richiesti;
- nessun test applicativo eseguito.

## FASE-0-AUDIT-REALE-LEGACY-E-CONTRATTI

### 1. Path di Progetto Verificato
- `C:\Users\patri\Desktop\fiscosim-viteBACKUPAntigravity` (Verificato tramite comandi del filesystem e compatibilità degli import dei moduli in data 28 Maggio 2026).

### 2. File Letti ed Analizzati
- `REPORT/ROADMAP_FISCOSIM_STUDIO_GRADE.md`
- `REPORT/REPORT_CODEX.md`
- `REGOLE_CODEX.md`
- `package.json`
- `vite.config.js`
- `src/modules/contabilita/data/contabilitaRepo.js` (Analisi di persistenza, storni, cancellazioni e query avanzate di consultazione)
- `src/modules/contabilita/application/manualRegistrationUiValidation.js` (Analisi della logica di validazione contabile/fiscale e blocchi UI per scenari complessi)
- `src/modules/contabilita/components/registrazione/RegistrazioneRitenuteDraftPanel.jsx` (Analisi della ritenuta d'acconto gestita nella UI)
- `src/modules/contabilita/components/registrazione/RegistrazioneIvaPanel.jsx`
- `src/modules/contabilita/application/persistPrimaNotaDraft.js`
- `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`
- `src/modules/contabilita/canonical/canonicalAccountingPayload.schema.js` (Analisi strutturale del contratto canonico)
- `src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js` (Analisi del motore di validazione del payload)

### 3. Comandi Eseguiti (Non Distruttivi)
- `git status` -> Eseguito in data 28 Maggio 2026. Evidenziate modifiche locali non committate nel branch `mio-branch` su 21 file contabili (consultazione, registrazione, ritenute, repo, views, ecc.) e file non tracciati in `scratch/`, `ROADMAP_Copilot.md` e `REPORT/ROADMAP_FISCOSIM_STUDIO_GRADE.md`. Nessun file è stato ripristinato, resettato o ripulito.
- `git diff --stat` -> Eseguito in data 28 Maggio 2026. Analisi quantitativa del diff locale (2167 inserimenti, 784 rimozioni complessive sui file modificati).
- `npm run build` -> Eseguito in data 28 Maggio 2026. Eseguita build di produzione Vite/Rollup con esito **positivo** (378 moduli trasformati, compilazione completata con successo in 5.06s senza alcun errore sintattico o di importazione).


### 4. Mappa dei 4 Moduli Core Reali

#### A. Inserimento Manuale / Registrazione Manuale
- **File principali**:
  - `src/modules/contabilita/views/RegistrazioneManualeView.jsx` (Vista UI di controllo e coordinamento)
  - `src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx` (Tabella delle righe contabili Dare/Avere)
  - `src/modules/contabilita/components/registrazione/RegistrazioneIvaPanel.jsx` (Pannello delle righe IVA)
  - `src/modules/contabilita/components/registrazione/RegistrazioneRitenuteDraftPanel.jsx` (Pannello ritenuta professionisti)
  - `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js` (Builder del payload di prima nota)
  - `src/modules/contabilita/application/manualRegistrationUiValidation.js` (Validatore degli stati dell'interfaccia)
  - `src/modules/contabilita/application/persistPrimaNotaDraft.js` (Servizio di persistenza del draft contabile)
- **Servizi usati**:
  - `services/primaNotaService.js` (API per Supabase: `createPrimaNota`, `insertPrimaNotaRighe`, `insertPrimaNotaPartitario`)
  - `src/modules/contabilita/data/contabilitaRepo.js` (Metodi `insertPrimaNota`, `insertPrimaNotaRighe`, `insertPrimaNotaPartitario`)
  - `src/modules/contabilita/application/percipientiRegistryService.js` (Servizio di allineamento/sincronizzazione anagrafica percipienti)
- **Dati letti**:
  - Piano dei conti (`piano_conti`), causali contabili (`causali_contabili`), causali IVA (`causali_iva`), anagrafiche (`societa`, `percipienti`, `clienti`), e documenti in transito (`documenti_contabilita`).
- **Dati scritti**:
  - Scritture di prima nota (`prima_nota` e `prima_nota_righe`), righe registri IVA (`registri_iva`), partite aperte/scadenze clienti e fornitori (`partitario`), ritenute d'acconto professionisti (`ritenute_dacconto`), e aggiornamento del `validation_status` su `documenti_contabilita`.
- **Punti di ingresso**:
  - `RegistrazioneManualeView.jsx` (caricata tramite tab `prima_nota_guidata` o `registrazione_manuale` in `PrimaNotaHubView.jsx`).
- **Dipendenze**:
  - Client Supabase (`lib/supabase.js`), schema del payload canonico (`canonicalAccountingPayload.schema.js`).
- **Stato stimato**:
  - *Avanzato/Quasi completo*. Gestisce efficacemente la navigazione da tastiera, multi-aliquota, e la pre-compilazione da template, ma presenta un blocco rigido a livello di validatore UI per gli scenari complessi (split payment, reverse charge, ritenute generiche, IVA per cassa).
- **Rischi regressione**:
  - Squilibrio Dare/Avere in scritture manuali atipiche, errori di arrotondamento nel calcolo dell'imposta IVA, disallineamento nei collegamenti dell'anagrafica cliente/fornitore se non risolti correttamente.

#### B. Consultazione Prima Nota
- **File principali**:
  - `src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx` (Punto di accesso primario)
  - `src/modules/contabilita/components/consultazione/ConsultazioneResultsTable.jsx` (Tabella render dei movimenti e delle righe contabili)
  - `src/modules/contabilita/components/consultazione/ConsultazioneSaldoSummary.jsx` (Visualizzazione saldo iniziale ed esercizio)
  - `src/modules/contabilita/application/consultazioneOperations/calculateConsultazioneSaldoProgressivo.js` (Calcolo del progressivo comprensivo di saldo d'apertura)
  - `src/modules/contabilita/application/consultazioneOperations/filterConsultazioneRows.js` (Algoritmo di filtraggio e ricerca lato client)
- **Servizi usati**:
  - `src/modules/contabilita/data/contabilitaRepo.js` (`getPrimaNotaConsultazioneRowsAdvanced`, `getContoSaldoPrecedente`).
- **Dati letti**:
  - Intestazioni prima nota (`prima_nota`), righe contabili (`prima_nota_righe`), mastrini e piano dei conti (`piano_conti`).
- **Dati scritti**:
  - Nessuno (modulo interamente read-only).
- **Punti di ingresso**:
  - `ConsultazionePrimaNotaView.jsx` (montato sul tab `consultazione` del modulo `contabilita`).
- **Dipendenze**:
  - Query builder avanzata (`getPrimaNotaConsultazioneRowsAdvanced`).
- **Stato stimato**:
  - *Completo/Eccellente*. Implementa paginazione, filtri avanzati per testo libero, importi precisi, intervalli di date, e calcolo dinamico del saldo progressivo basato sul conto con retroattività per l'esercizio precedente.
- **Rischi regressione**:
  - Rallentamenti sulle query a range molto larghi senza filtri (attenuato dal limite a 10.000 righe e dalla paginazione), bug nell'ordinamento a 3 stati sulle colonne delle date.

#### C. Import Contabilità
- **File principali**:
  - `src/modules/import_contabilita/index.jsx` (Componente principale di controllo)
  - `src/modules/import_contabilita/data/importContabilitaRepo.js` (Query di staging)
- **Servizi usati**:
  - Supabase client, OCR ed estrattori dati AI.
- **Dati letti**:
  - Staging documenti importati (`documenti_import`), piano conti, causali.
- **Dati scritti**:
  - Aggiornamento stato di `documenti_import`, creazione di draft di prima nota canoniche.
- **Punti di ingresso**:
  - `src/modules/import_contabilita/index.jsx` (Modulo "Import Documenti" referenziato in `App.jsx`).
- **Dipendenze**:
  - Staging AI (`ai_raw_response`), bridge di integrazione con `import_unificato` (mappers e memorie di matching).
- **Stato stimato**:
  - *Transitorio/Parziale*. Il modulo è in fase di consolidamento e dipende ancora da funzioni ed anagrafiche esportate da `import_unificato` (deprecato).
- **Rischi regressione**:
  - Errori di matching automatico del soggetto (cliente/fornitore) basato su P.IVA/CF, fallimenti nel parsing di file XML non standard, regressione legata all'accoppiamento con `import_unificato`.

#### D. Riconciliazione Bancaria
- **File principali**:
  - `src/modules/contabilita/views/RiconciliazioneBancariaView.jsx` (Interfaccia di lavoro dell'operatore)
  - `src/modules/contabilita/components/riconciliazione/RiconciliazioneMovementWorkingView.jsx` (Dettaglio movimento)
  - `src/modules/contabilita/components/riconciliazione/scoreRiconciliazioneMatch.js` (Algoritmo di calcolo confidenza delle proposte di match)
  - `src/modules/contabilita/components/riconciliazione/mapReconciliationDecisionToCanonicalPayload.js` (Generatore del payload di prima nota dal match confermato)
- **Servizi usati**:
  - `src/modules/contabilita/data/contabilitaRepo.js` (`getContiBancari`, `getMovimentiBancariRecenti`, `getPartitarioAperto`, `upsertMovimentoBancario`).
- **Dati letti**:
  - Movimenti estratti conto bancari (`movimenti_bancari`), scadenze aperte (`partitario`), conti bancari societari (`conti_bancari`).
- **Dati scritti**:
  - Aggiornamento dello stato dei movimenti bancari, generazione e commit di registrazioni di prima nota di tipo pagamento/incasso, aggiornamento e chiusura automatica del partitario (`partitario`).
- **Punti di ingresso**:
  - `RiconciliazioneBancariaView.jsx` (caricata tramite tab `riconciliazione` o `movimenti_banca`).
- **Dipendenze**:
  - Motore di matching probabilistico, normalizzatori di tracciati bancari (es. `parseBancoDiSardegnaStatement`).
- **Stato stimato**:
  - *Avanzato/Operativo*. Offre un'ottima interfaccia di riconciliazione e associazione parziale, traducendo correttamente le decisioni in scritture canoniche.
- **Rischi regressione**:
  - Doppia riconciliazione dello stesso movimento, disallineamento dei saldi bancari nel partitario se la transazione non viene salvata atomicamente, cancellazioni orfane in caso di storno del movimento riconciliato.

---

### 5. Mappa delle Dipendenze Legacy

| Riferimento | File Principale | Funzione / Componente | Tipo Dipendenza | Stato Stimato | Rischio | Proposta di Gestione |
|---|---|---|---|---|---|---|
| **`import_fatture`** | `src/modules/import_fatture/index.jsx` | Parsing ed interfaccia di staging fatture elettroniche. | Transitoria | Legacy / Deprecata ma attiva | **Medio** | Sostituire progressivamente convogliando il flusso in `import_contabilita`. |
| **`import_unificato`** | `src/modules/import_unificato/index.jsx` | Modulo di matching, mapping e container storage. | Attiva / Transitoria | Legacy (vietata in REGOLE_CODEX) ma usata come core da `import_fatture` | **Alto** | Isolare i moduli di parsing e matching sotto `src/shared/parsing` e dismettere definitivamente la cartella. |
| **`import_nuovo`** | `src/modules/import_nuovo/index.jsx` | Caricamento e validazione iniziale XML FE. | Transitoria | Deprecata / Dismessa | **Basso** | Rimuovere i vecchi riferimenti in `App.jsx` ed eliminare la cartella da `src/modules`. |
| **`documenti_import`** | `src/modules/import_contabilita/data/importContabilitaRepo.js` | Tabella database di staging Supabase. | Attiva / Canonica | Infrastruttura dati corretta per lo staging | **Nullo** | Mantenere e documentare come area ufficiale di staging pre-registrazione. |
| **`accounting_entries`** | `src/modules/contabilita/data/contabilitaRepo.js` | Vecchia tabella database di prima nota. | Transitoria / Da eliminare | Legacy / Deprecata (sostituita da `prima_nota` e `prima_nota_righe`) | **Medio-Alto** | Verificare se contiene dati storici da migrare ed eliminare definitivamente i riferimenti rimasti nei file `da_validare_split_view.jsx`. |
| **`partitari` (plurale)** | `src/modules/contabilita/views/StampeView.jsx` | Etichetta UI e filtro per schede clienti/fornitori nelle stampe. | Attiva (solo UI) | Termine descrittivo visuale | **Nullo** | Mantenere per chiarezza terminologica dell'operatore, garantendo che le query puntino a `partitario` (singolare). |
| **`prima_nota_guidata.jsx`** | `src/modules/contabilita/views/PrimaNotaHubView.jsx` | Tab alias UI che monta la nuova `RegistrazioneManualeView.jsx`. | Transitoria (solo UI) | Alias UI temporaneo | **Basso** | Ridenominare il tab in `registrazione_manuale` ed eliminare il file `prima_nota_guidata.jsx` in disuso. |
| **`DISUSO`** | Cartella `/DISUSO` nella root del progetto. | Contiene copie duplicate e vecchie di `import_nuovo`. | Morta | Dismessa | **Nullo** | Eliminare fisicamente la cartella alla fine della migrazione per pulire il workspace. |

---

### 6. Mappa del Contratto Dati Canonico Attuale

- **`prima_nota` (Header)**:
  - *Cosa è già canonico*: ID, societa_id, data_registrazione, numero_registrazione, causale_codice, descrizione, stato, totale_dare, totale_avere.
  - *Cosa è parziale*: Il tracciamento dell'ID del documento sorgente (`documento_sorgente_id`) per risalire alla fattura.
  - *Cosa è duplicato*: Informazioni denormalizzate come `cliente_fornitore_nome`.
  - *Cosa è legacy*: L'uso residuo di `accounting_entries` in viste storiche.
  - *Cosa è mancante*: Un vincolo a livello DB (periodo chiuso) che impedisca scritture retroattive.
- **`prima_nota_righe` (Righe Contabili)**:
  - *Cosa è già canonico*: riga_numero, conto_id, conto_codice, conto_descrizione, descrizione_riga, importo_dare, importo_avere.
  - *Cosa è parziale*: Il codice causale IVA (`causale_iva_codice`) salvato sulle righe contabili (a volte ereditato dalla testata).
  - *Cosa è duplicato*: Il codice e la descrizione del conto salvati direttamente sulla riga (denormalizzazione rispetto a `piano_conti`).
  - *Cosa è mancante*: Il collegamento analitico con centri di costo e commesse.
- **Registri IVA (`registri_iva`)**:
  - *Cosa è già canonico*: imponibile, iva, totale, causale_iva_codice, registro_codice, data, tipo.
  - *Cosa è parziale*: La separazione netta dell'imposta split payment e il differimento dell'esigibilità per l'IVA per cassa.
  - *Cosa è mancante*: L'indetraibilità parziale integrata a livello di riga.
- **Partitario (`partitario` e scadenze)**:
  - *Cosa è già canonico*: societa_id, prima_nota_id, soggetto_id, importo_originale, importo_pagato, importo_residuo, data_scadenza, stato (aperta/chiusa).
  - *Cosa è parziale*: La riconciliazione automatica delle partite all'atto dell'incasso/pagamento.
  - *Cosa è mancante*: La gestione di scadenze multi-rata nativa nel partitario senza sdoppiamento manuale.
- **Ritenute (`ritenute_dacconto`)**:
  - *Cosa è già canonico*: societa_id, data_pagamento, percipiente_denominazione, imponibile, ritenuta, aliquota_ritenuta.
  - *Cosa è parziale*: Il collegamento con la prima nota. Attualmente è implementato tramite un **meccanismo fragile** basato sulla serializzazione dell'ID della prima nota all'interno della stringa di testo del campo `note` (es. `note` like `%primaNotaId%`).
  - *Cosa è mancante*: Una vera chiave esterna `prima_nota_id` o `partitario_id` nella tabella `ritenute_dacconto` per stabilire relazioni referenziali stabili ed indicizzabili.
- **Audit**:
  - *Cosa è già canonico*: Tracciamento parziale nei log o in fase di storno.
  - *Cosa è mancante*: Una tabella dedicata `audit_log` append-only centralizzata nel database per monitorare ogni modifica contabile (before/after, utente, IP, timestamp).
- **Stati Scrittura**:
  - *Cosa è già canonico*: stati `bozza`, `confermata`, `annullata` in `prima_nota.stato`.
  - *Cosa è parziale*: Il blocco delle modifiche su periodi IVA consolidati o stampati definitivi (gestito parzialmente in UI ma non blindato nel DB).

---

### 7. Individuazione Logica Contabile/Fiscale nella UI (JSX)

1. **Formula di Calcolo e Validazione Ritenuta d'Acconto**:
   - *File*: `src/modules/contabilita/components/registrazione/RegistrazioneRitenuteDraftPanel.jsx` (righe 287-288, ecc.)
   - *Descrizione*: Il calcolo matematico della ritenuta d'acconto (20% sulla base imponibile risolta), la determinazione delle aliquote per la cassa previdenziale e la verifica della tolleranza di arrotondamento (`Math.abs(...) < 0.01`) sono eseguiti direttamente nel codice JSX del pannello React.
   - *Rischio*: **Alto**. Qualsiasi aggiornamento alle regole fiscali italiane richiede una modifica al frontend, impedendo il riutilizzo delle regole di validazione delle ritenute in processi automatici di background (es. parser di importazione).
   - *Proposta di gestione*: Spostare tutte le formule in un servizio di dominio (es. `ritenuteDomainService.js`) da richiamare sia dai pannelli React che dalle API backend.

2. **Rilevazione Testuale e Blocco Scenari Complessi**:
   - *File*: `src/modules/contabilita/application/manualRegistrationUiValidation.js` (righe 54-72 e 157-173)
   - *Descrizione*: Il validatore della UI esegue una stringizzazione globale dell'oggetto documento (`JSON.stringify`) e cerca tramite `includes` parole chiave come "split payment", "reverse charge" o "iva per cassa". Se trovate, blocca preventivamente la registrazione manuale.
   - *Rischio*: **Medio-Alto**. La ricerca testuale euristica può generare falsi positivi (es. se la descrizione del documento o della riga contiene casualmente parole simili), bloccando registrazioni lecite. Inoltre, la logica di blocco è rigida ed impedisce l'evoluzione dei moduli.
   - *Proposta di gestione*: Spostare e strutturare i controlli sulle proprietà del record (flags anagrafica e tipi causali) e rimuovere il blocco preventivo non appena verranno implementate le relative fasi fiscali (Fasi 13, 14, 15).

3. **Logica di sbilancio e quadratura Dare/Avere**:
   - *File*: `src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx` e `applyRegistrazioneSbilancio.js`
   - *Descrizione*: Calcolo lato client dello sbilancio della registrazione e visualizzazione visiva dello stato (badge rosso/verde).
   - *Rischio*: **Basso**. È lecita la presenza lato client per fornire feedback immediato all'utente in fase di digitazione.
   - *Proposta di gestione*: Lasciare nella UI, ma garantire che la validazione definitiva avvenga in modo vincolante a livello di transazione backend.

---

### 8. Analisi di Preparazione per FASE 1 e FASE 2

#### FASE 1 — Contratto Canonico PN Semplice
- **Prerequisiti già presenti**:
  - Struttura iniziale del contratto canonico definita in `canonicalAccountingPayload.schema.js` e mapper di base per la registrazione manuale.
- **File da toccare probabilmente**:
  - `src/modules/contabilita/canonical/canonicalAccountingPayload.schema.js` (per irrigidire le regole formali del payload)
  - `src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js` (per allineare la mappatura escludendo campi denormalizzati)
- **File da NON toccare**:
  - Componenti grafici UI (`RegistrazioneManualeView.jsx` o tabelle associate), file legacy di importazione.
- **Test esistenti**:
  - `canonicalContabilitaDraftMapper.test.js` (verifica elementare del mapper).
- **Test mancanti**:
  - Test suite per scritture contabili pure (Dare/Avere senza IVA e senza partitario) per verificare la corretta validazione formale del contratto canonico.
- **Rischi**:
  - Rifiuto di payload corretti a causa di restrizioni eccessive sul modello o mancata corrispondenza dei tipi di dato.
- **Prompt consigliato per l'implementazione**:
  ```text
  [PROMPT IMPLEMENTAZIONE FASE 1]
  Attiva la FASE 1 irrigidendo il contratto canonico per la Prima Nota semplice in `src/modules/contabilita/canonical/canonicalAccountingPayload.schema.js`. Assicurati che i mapper in `mappers/mapRegistrazioneManualeToCanonical.js` producano esclusivamente il payload conforme, rimuovendo ogni campo non standard o denormalizzato non previsto dal contratto canonico. Implementa una suite di unit test in `canonicalContabilitaDraftMapper.test.js` per validare scritture contabili pure (Dare/Avere senza IVA e senza partitario) verificando che vengano mappate correttamente e superino la validazione formale. Non modificare il database o la UI.
  ```

#### FASE 2 — Save Atomico PN Semplice e Audit Base
- **Prerequisiti già presenti**:
  - Metodi `createPrimaNota`, `insertPrimaNotaRighe` in `services/primaNotaService.js` e funzioni di rollback transazionale controllato in `contabilitaRepo.js` (`deleteScritturaControllata`).
- **File da toccare probabilmente**:
  - `src/modules/contabilita/application/persistPrimaNotaDraft.js` (per renderlo interamente transazionale e atomico)
  - `services/primaNotaService.js` (per blindare il salvataggio referenziale)
  - Creazione di un modulo di audit log centralizzato (`src/shared/audit/auditLogger.js` o simili)
- **File da NON toccare**:
  - Codice UI della registrazione o visualizzazione.
- **Test esistenti**:
  - `persistPrimaNotaDraft.test.js` (test di persistenza base).
- **Test mancanti**:
  - Test di rollback in caso di errore su una riga contabile (verifica dell'atomicità: se l'inserimento di una riga contabile fallisce, l'intero header deve essere rimosso o la transazione abortita).
  - Test di generazione dell'evento di audit.
- **Rischi**:
  - Scritture orfane nel database a causa di transazioni parziali non gestite correttamente (Supabase non supporta transazioni complesse multi-tabella native lato client senza RPC postgres dedicati).
- **Prompt consigliato per l'implementazione**:
  ```text
  [PROMPT IMPLEMENTAZIONE FASE 2]
  Implementa la FASE 2 garantendo l'atomicità totale del salvataggio in `src/modules/contabilita/application/persistPrimaNotaDraft.js`. Utilizza una singola transazione (o una procedura memorizzata RPC su Supabase se necessario, oppure un workflow controllato di rollback transazionale in caso di eccezioni) per inserire contemporaneamente testata (`prima_nota`) e righe (`prima_nota_righe`). Scrivi una suite di test in `persistPrimaNotaDraft.test.js` che simuli il fallimento dell'inserimento delle righe e verifichi che l'header non venga persistito o venga rimosso (rollback). Implementa un meccanismo di audit base append-only che scriva un log dell'operazione di creazione. Non toccare la UI.
  ```

---

### 9. Raccomandazione Finale di Audit (Fase 0)
- **Si raccomanda vivamente di procedere alla FASE 1**. Il nucleo della contabilità è solido, la compilazione del progetto è pulita e i moduli principali sono ben strutturati. La formalizzazione del contratto canonico (FASE 1) e la messa in sicurezza della persistenza atomica con audit (FASE 2) rappresentano i passi fondamentali ed obbligatori per garantire la robustezza "studio-grade" prima di affrontare le complessità fiscali successive.

**Conferma Operativa**: Nessun codice applicativo, database, migration, auth o ambiente `.env` è stato modificato durante questa attività di audit di FASE 0.

## FASE-1A-CONTRATTO-CANONICO-PN-SEMPLICE

### 1. Obiettivo dell'Attività
L'obiettivo della **FASE 1A** è congelare e blindare il contratto canonico per la **Prima Nota (PN) semplice** (scritture contabili pure, senza IVA, partitario o ritenute) attraverso un audit tecnico e l'introduzione di validazioni rigorose e di una suite di test automatici nativi non distruttivi. 

Questa fase garantisce che il nucleo della prima nota sia solido, strutturalmente corretto, privo di importi invalidi o conti orfani e pienamente conforme alle policy delle causali contabili, senza in alcun modo rompere la retrocompatibilità con i payload esistenti o modificare il database.

### 2. Modifiche Apportate al Validatore
Le modifiche sono state implementate in modo additivo e conservativo nel validatore centrale:
[validateCanonicalAccountingPayload.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js)

- **Importazioni e Integrazioni**:
  - Importati gli stati ammessi `CANONICAL_ACCOUNTING_REGISTRATION_STATES` per validare rigorosamente lo stato della registrazione.
  - Importato `buildCausaleContabilePolicy` per risolvere a runtime le regole di business impostate per ciascuna causale.
- **Validazione dello Schema e Sezioni Obbligatorie**:
  - Estesa la tolleranza di `validateRequiredSections` per accettare `schemaVersion` sia come stringa che come oggetto (garantendo la piena compatibilità con i valori di default legacy del mapper).
- **Validazione del Contesto Società**:
  - Spostato il controllo su `company.societaId` a livello globale. Ora la mancanza dell'identificativo genera un errore sia in modalità `draft` che `commit` ed è bloccante in modalità `commit`.
- **Validazione dello Stato**:
  - Aggiunto il controllo formale su `header.stato`, che deve essere presente e compreso nell'insieme degli stati contabili ammessi.
- **Validazione Analitica delle Righe Contabili (`validatePrimaNota`)**:
  - **Conti Orfani**: Verificato che ogni riga contabile in `accounting.rows` contenga un `accountId` valido.
  - **Importi Non Negativi**: Ciascun importo `dare` o `avere` deve essere un valore numerico finito e maggiore o uguale a zero.
  - **Importo Non Zero**: Almeno uno dei due importi (`dare` o `avere`) deve essere strettamente maggiore di zero (bloccando righe vuote).
  - **Mutua Esclusione**: Bloccata la presenza simultanea di importi in `dare` e `avere` sulla stessa riga (una riga contabile è strettamente Dare o Avere).
- **Integrità con le Policy delle Causali**:
  - Se la causale utilizzata è qualificabile come documento IVA (`policy.isDocumentoIva === true`), il validatore blocca il commit se il target `targets.shouldCreateIva !== true`.
  - Se la causale utilizzata richiede la gestione del partitario (`policy.gestionePartitario !== 'nessuno'`), il validatore blocca il commit se il target `targets.shouldCreateLedger !== true`.

### 3. Suite di Test Automatizzati
È stata creata una suite di unit test nativi in:
[canonicalAccountingValidation.test.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/tests/canonicalAccountingValidation.test.js)

La suite copre **10 scenari non distruttivi** per verificare i comportamenti attesi:
1. **PN semplice bilanciata Dare/Avere valida**: Un payload semplice e ben quadrato supera la validazione sia in draft che in commit (readiness `ready`).
2. **PN semplice non bilanciata bloccata**: Se `quadratura.isBalanced` è `false` o lo sbilancio è diverso da zero, il commit viene bloccato.
3. **PN semplice senza IVA valida solo se causale non IVA**: Le causali generiche superano la validazione senza target IVA, mentre le causali IVA (es. `FF`) generano un blocco se il modulo IVA è disattivato.
4. **PN semplice senza partitario valida solo se causale non richiede soggetto/partita**: Le causali generiche superano la validazione senza partitario, mentre le causali con partite attive (es. `operazionePartite: 'apertura'`) vengono bloccate se il modulo partitario è disattivato.
5. **Righe con conto mancante bloccate**: Righe prive di `accountId` generano errori bloccanti.
6. **Importi zero o negativi gestiti correttamente**: Vengono intercettati e bloccati importi negativi, righe con Dare/Avere entrambi a zero e righe con valori in entrambe le colonne.
7. **`societa_id` obbligatorio**: La mancanza del codice società in testata genera errori in draft ed è bloccante in commit.
8. **Data registrazione obbligatoria**: L'assenza di `fiscalContext.dataRegistrazione` blocca il salvataggio in commit.
9. **Causale contabile obbligatoria**: L'assenza di `header.causaleContabile` (o del relativo codice/ID) è bloccante.
10. **Stato ammesso**: Uno stato non riconosciuto (fuori dai valori ammessi dello schema) genera un blocco in commit.

### 4. Esito delle Verifiche e Stato della Build
Tutte le verifiche di integrità e compilazione hanno avuto esito **positivo**:
- **Test Unitari**: Eseguiti tramite il test runner nativo di Node.js.
  - **Risultato**: `pass 10 / 10` test. Tutti gli scenari sono stati convalidati con successo in `92.8ms`.
- **Compilazione & Bundling**: Eseguita build di produzione con Vite/Rollup (`npm run build`).
  - **Risultato**: Compilazione completata con successo in `5.16s` senza alcun avviso o errore di importazione, garantendo che nessuna delle modifiche effettuate abbia corrotto la compilazione del frontend.

### 5. Preservazione della Retrocompatibilità
Tutti gli interventi sono stati eseguiti seguendo la regola del **non-breaking**:
- Non è stato alterato lo schema del database (nessuna migrazione, query o schema Supabase è stato toccato).
- Non sono stati modificati i mapper legacy né sono stati rimossi campi esistenti (es. `accountCode`, `accountDescription` e le altre denormalizzazioni della UI sono state preservate per consentire il perfetto funzionamento delle viste React JSX esistenti).
- La flessibilità sul tipo del campo `schemaVersion` impedisce il rigetto di vecchi payload generati da componenti che passavano configurazioni predefinite in formato oggetto.

---

## VERIFICA-PERIMETRO-FASE-1A

### 1. File Realmente Modificati in FASE 1A
- **Validatore**: [`src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js) — *Modificato*
- **Test Suite**: [`tests/canonicalAccountingValidation.test.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/tests/canonicalAccountingValidation.test.js) — *Creato (Untracked)*
- **Documentazione**: [`REPORT/REPORT_CODEX.md`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/REPORT/REPORT_CODEX.md) — *Modificato*

### 2. File Modificati Appartenenti a Lavorazioni Precedenti
Nello stato del repository (working directory) sono presenti modifiche ed ottimizzazioni che risalgono a lavorazioni precedenti (relativamente all'aggancio del percipiente, visualizzazione split-screen, saldi storici e cassetto consultazione). Questi file **non sono stati toccati o modificati in alcun modo per la FASE 1A**, che ne ha preservato intatto il funzionamento:
- **Codice Interfaccia Utente (UI)**:
  - `src/modules/contabilita/views/RegistrazioneManualeView.jsx`
  - `src/modules/contabilita/components/registrazione/RegistrazioneRitenuteDraftPanel.jsx`
  - `src/modules/contabilita/components/consultazione/ConsultazioneDetailSidebar.jsx` *(Nuovo file untracked)*
  - `src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx`
  - `src/modules/contabilita/components/consultazione/ConsultazioneResultsTable.jsx`
- **Servizi e Logiche Applicative (Business Logic)**:
  - `services/primaNotaService.js`
  - `src/modules/contabilita/application/persistPrimaNotaDraft.js`
  - `src/modules/contabilita/data/contabilitaRepo.js`
- **Altri File di Supporto (Lavorazioni Precedenti)**:
  - `src/assets/global.css`
  - `src/modules/contabilita/application/consultazioneOperations/buildConsultazioneQueryParams.js`
  - `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js`
  - `src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneRitenutaDraft.js`
  - `src/modules/contabilita/application/registrazioneOperations/calculateRegistrazioneRitenutaTotals.js`
  - `src/modules/contabilita/application/registrazioneOperations/resolveRegistrazioneRitenutaDefaults.js`
  - `src/modules/contabilita/application/registrazioneOperations/validateRegistrazioneDraft.js`
  - `src/modules/contabilita/canonical/canonicalAccountingPayload.schema.js`
  - `src/modules/contabilita/components/consultazione/ConsultazioneSaldoSummary.jsx`
  - `src/modules/contabilita/components/registrazione/RegistrazioneIvaPanel.jsx`
  - `src/modules/contabilita/components/registrazione/RegistrazioneRowsTable.jsx`
  - `src/modules/contabilita/components/registrazione/registrazioneUi.js`
  - `src/modules/contabilita/index.jsx`
  - `src/modules/contabilita/views/PrimaNotaHubView.jsx`

### 3. Delimitazione del Perimetro
- **Conferma**: Si attesta che l'implementazione della **FASE 1A** ha toccato **esclusivamente il validatore (`validateCanonicalAccountingPayload.js`), introdotto la suite di test (`canonicalAccountingValidation.test.js`) e aggiornato la documentazione (`REPORT/REPORT_CODEX.md`)**. 
- Non è stato modificato in questa sessione alcun codice di business, viste UI, client DB o file di migrazione legati alla Prima Nota semplice o a lavorazioni successive.

### 4. Esito dei Test Eseguiti
- **Comando**: `node --test tests/canonicalAccountingValidation.test.js`
- **Esito**: **10 / 10 test passati** con successo. Vengono verificati in modo non distruttivo tutti gli scenari critici di Prima Nota semplice.

### 5. Stato della Build di Produzione
- **Comando**: `npm run build`
- **Esito**: **Successo**. Compilazione e bundling eseguiti perfettamente in `5.16s` senza alcun warning o errore sintattico.

### 6. Autorizzazione al Procedimento
- **Conferma Operativa**: Le modifiche di FASE 1A sono interamente isolate, verificate, retrocompatibili e testate con esito positivo. **Si conferma che il perimetro è sicuro e si può procedere alla fase successiva della roadmap** in conformità con le direttive del progetto.

---

## FASE-2-SAVE-ATOMICO-PN-SEMPLICE

### 1. File Modificati in FASE 2
- **Persistenza**: [`src/modules/contabilita/application/persistPrimaNotaDraft.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/application/persistPrimaNotaDraft.js) — *Modificato*
- **Test Suite**: [`tests/persistPrimaNotaDraft.test.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/tests/persistPrimaNotaDraft.test.js) — *Creato (Untracked)*
- **Documentazione**: [`REPORT/REPORT_CODEX.md`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/REPORT/REPORT_CODEX.md) — *Modificato*

### 2. Cosa è Stato Implementato
- **Validazione Canonica Preventiva**:
  - Inserito l'import del mapper [`mapRegistrazioneManualeToCanonical`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js) all'interno di `persistPrimaNotaDraft.js`.
  - Prima di effettuare qualsiasi operazione di scrittura o contattare il database, il `draft` viene convertito in payload canonico e convalidato tramite `validateCanonicalAccountingPayload(payload, { mode: 'commit' })`.
  - Estrapolati l'operatore (`operatorId`) e il timestamp (`createdAt`) direttamente dai metadati del draft o dai campi del payload per popolare correttamente la testata di audit trail della validazione.
  - Se il validatore rileva problemi bloccanti (`blocking.length > 0`), la persistenza viene immediatamente abortita ritornando gli errori associati prima del write.
- **Trace Tecnico Temporaneo in Console**:
  - Su salvataggio completato con successo, viene emesso in console un log strutturato con tag `[AUDIT_PN_SEMPLICE_TRACE]` contenente i metadati essenziali (ID record, data registrazione, totale Dare/Avere, operatore e data salvataggio).
  - *Nota*: Questo tracciamento è definito esclusivamente come **trace tecnico temporaneo** per il debug e il monitoraggio immediato in questa fase.
- **Test Suite Dedicata**:
  - Creato il file di test `tests/persistPrimaNotaDraft.test.js` che implementa un client database simulato in memoria (`FakeDb`/`MockDbClient`) per verificare in modo sicuro e non distruttivo tutti i flussi di salvataggio contabile.

### 3. Cosa NON è Stato Toccato (Perimetro Stretto)
- **Nessuna Scrittura IVA**: Nessun inserimento è stato effettuato su `registri_iva` per le scritture di Prima Nota semplice.
- **Nessuna Scrittura Partitario**: Nessun inserimento o chiusura è stato tentato su `partitario`.
- **Nessuna Scrittura Ritenute**: Nessun inserimento è avvenuto su `ritenute_dacconto`.
- **Nessuna Modifica Fiscale o UI**: Nessuna interfaccia React JSX, componente grafico, modulo di importazione, riconciliazione o servizio contabile alternativo è stato alterato.
- **Nessuna Modifica al DB**: Non sono stati modificati tabelle, trigger, vincoli, né create RPC SQL sul database Supabase.

### 4. Strategia di Atomicità e Limiti Tecnici
- **Strategia Adottata**: Viene utilizzato un meccanismo di **rollback best-effort coordinato lato client** (eseguito da `cleanupPrimaNotaCompleta` in `services/primaNotaService.js`). Se l'inserimento delle righe contabili (`prima_nota_righe`) fallisce, il client lancia una sequenza ordinata di istruzioni di cancellazione `DELETE` per rimuovere in cascata tutti i record parziali inseriti e infine la testata `prima_nota`.
- **Limiti della Strategia (Mancanza di Atomicità ACID Assoluta)**:
  - Poiché le operazioni vengono eseguite tramite una catena di singole chiamate HTTP separate sul client, **questa strategia non offre atomicità ACID assoluta**.
  - Esiste il rischio reale che la testata rimanga **orfana** qualora il client subisca una perdita improvvisa di alimentazione/connessione di rete a metà esecuzione, o nel caso in cui le chiamate di cancellazione per il cleanup falliscano a causa di errori temporanei del server.
  - **Prerequisito Futuro**: Una vera e assoluta atomicità ACID contabile richiederà in futuro lo sviluppo di una procedura transazionale PostgreSQL centralizzata (funzione SQL con RPC dedicata) per eseguire l'intero salvataggio all'interno di un singolo blocco `BEGIN ... COMMIT / ROLLBACK` lato server.
  - **Prerequisito Audit**: L'implementazione di un sistema di audit log "studio-grade" persistente e inalterabile richiederà la creazione di una tabella dedicata (es. `audit_logs`) append-only blindata da politiche RLS, che è esclusa dal perimetro corrente.

### 5. Esito dei Test Eseguiti
- **Test Unitari di Persistenza**: Eseguiti tramite `node --test tests/persistPrimaNotaDraft.test.js`.
  - **Scenari Testati**:
    1. Salvataggio corretto di testata e righe per PN semplice bilanciata. 🟢
    2. Fallimento dell'inserimento delle righe che innesca correttamente il cleanup (cancellazione) dell'header `prima_nota` pre-inserito per evitare record orfani. 🟢
    3. Payload non valido (es. assenza di `societaId`) bloccato a monte prima di effettuare qualsiasi chiamata di scrittura. 🟢
    4. Nessuna chiamata di inserimento a moduli non attivi (IVA, partitario o ritenute) per PN semplice. 🟢
  - **Esito**: **4 su 4 test passati** con successo.
- **Test di Validazione Canonica (FASE 1A)**: Eseguiti tramite `node --test tests/canonicalAccountingValidation.test.js`.
  - **Esito**: **10 su 10 test passati** con successo (retrocompatibilità e integrità formale confermate al 100%).
- **Compilazione & Bundling**: Eseguito `npm run build`.
  - **Esito**: Compilazione completata con successo in `6.83s` con Vite e Rollup, senza alcun warning o errore strutturale.

### 6. Autorizzazione al Procedimento
- **Conferma Operativa**: Le modifiche di FASE 2 sono state verificate e testate con successo in piena conformità ai vincoli operativi. Le testate orfane in caso di interruzioni runtime sono gestite al meglio delle possibilità consentite senza alterazioni del database.
- **Si conferma che si può procedere alla fase successiva della roadmap.**

---

## FASE-2-FIX-PN-SEMPLICE-NON-DEVE-RICHIEDERE-IVA-RITENUTE-SOGGETTI

### 1. Causa Precisa dell'Errore
La diagnosi ha rivelato tre cause concomitanti per cui una **Prima Nota semplice** (es. causale `PD - PAGAMENTI DIVERSI`) veniva erroneamente validata come flusso con soggetti, IVA e ritenute:
1. **Rilevamento Stale/Incoerente dei Target**: Nel mapper, `shouldCreateIva`, `shouldCreateLedger` e `shouldCreateWithholding` erano valutati semplicemente controllando l'esistenza dei pannelli UI o di campi `enabled/active` ereditati dallo stato React (che sono valorizzati di default a `true` anche se le righe sono vuote).
2. **Assenza della Policy Causale nel Mapper**: Il mapper non interrogava la policy `buildCausaleContabilePolicy` per escludere a monte i target non pertinenti (es. causale PD non è un documento IVA, non gestisce partitario e non prevede ritenute).
3. **Controllo Soggetti Uncondizionato**: Il validatore `validateSubjects` pretendeva la presenza di almeno un soggetto in modo incondizionato, bloccando Giroconti o Pagamenti Diversi che per natura non prevedono clienti o fornitori.
4. **Risoluzione dello Stato**: `header.stato` non riusciva ad allinearsi poiché nella UI lo stato si trova annidato in `draft.header.stato` o `draft.pnPayload.stato` piuttosto che in `draft.stato`.

### 2. File Modificati
- **Validatore**: [`src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js)
  - Modificata `validateSubjects`: i soggetti vengono richiesti ed analizzati **solo se il flusso coinvolge effettivamente dei soggetti** (partitario attivo, ritenute attive, o registro IVA compilato). Per giroconti o pagamenti diversi puri, il controllo non è più bloccante.
- **Mapper**: [`src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js)
  - Integrata la policy `buildCausaleContabilePolicy` a livello di mapping.
  - I target `shouldCreateIva`, `shouldCreateLedger` e `shouldCreateWithholding` vengono attivati **solo se espressamente richiesti dalla policy della causale**, oppure se i rispettivi pannelli sono attivi **e** l'utente ha inserito righe reali e non vuote.
  - Aggiunta la pulizia automatica dei blocchi (`vat`, `ledger`, `withholding`) nel payload canonico se i rispettivi target sono disattivati, per evitare l'invio di righe vuote o stale.
  - Esteso il parsing di `header.stato` scansionando multipli livelli del draft e validando contro gli stati ammessi (con fallback automatico a `'bozza'`).
- **Test Suite**: [`tests/persistPrimaNotaDraft.test.js`](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/tests/persistPrimaNotaDraft.test.js)

### 3. Test Aggiunti
Sono stati aggiunti **4 nuovi test automatici** nella suite di persistenza per blindare il comportamento ed evitare regressioni:
- **Test 5**: Verifica che una PN semplice con causale `PD` salvi testata e righe senza richiedere soggetti, moduli IVA, partitari o ritenute. 🟢
- **Test 6**: Verifica che una PN semplice con causale `PD` bilanciata superi con successo la validazione in fase di commit. 🟢
- **Test 7**: Verifica che un draft con ritenute attive ma vuote/stale non generi alcuna riga in `withholding.rows` e mantenga `shouldCreateWithholding = false`. 🟢
- **Test 8**: Verifica che un draft con IVA attiva ma priva di righe reali non richieda `vat.registerType` e mantenga `shouldCreateIva = false`. 🟢

### 4. Esito delle Verifiche
Tutti i test e i controlli eseguiti hanno dato esito **positivo**:
- **Test Unitari Persistenza (FASE 2 + FIX)**: Esecuzione di `node --test tests/persistPrimaNotaDraft.test.js` $\rightarrow$ **8 su 8 test passati** con successo in `158.3ms`.
- **Test Validatore Canonico (FASE 1A)**: Esecuzione di `node --test tests/canonicalAccountingValidation.test.js` $\rightarrow$ **10 su 10 test passati** con successo in `105.0ms`.
- **Integrità Build**: `npm run build` eseguito con successo in `5.27s` con Vite e Rollup, confermando la totale assenza di errori o warning.

### 5. Cosa NON è Stato Toccato (Perimetro di Sicurezza)
- Non sono stati alterati i pannelli IVA/Partitario/Ritenute a livello grafico (UI JSX).
- Non è stato modificato in alcun modo lo stato interno del database, migrazioni, auth o configurazioni `.env`.
- I moduli di Importazione, Consultazione e Riconciliazione sono rimasti intatti e isolati.

### 6. Indicazioni per il Test Manuale
- Il test manuale sulla causale `PD` (es. Banca 100 in Avere vs Cespiti 100 in Dare) **può e deve essere ripetuto ora**.
- Il salvataggio andrà a buon fine senza produrre alcuna notifica bloccante e genererà il trace log tecnico in console come previsto dal perimetro di FASE 2.

---
