# Audit tecnico del progetto

Data snapshot: 2026-04-22

Questo file contiene una fotografia tecnica del progetto con un obiettivo preciso:
distinguere codice vivo, codice legacy/in disuso, collegamenti reali tra moduli e punti pericolosi in cui il codice attuale potrebbe agganciarsi a funzioni vecchie.

Nota importante:
- Questo documento non modifica nulla del codice.
- Le classificazioni sotto sono basate su import, export, call site, routing e flussi realmente osservati.
- Dove la certezza non è completa, viene dichiarato esplicitamente.

## 1. Executive summary

Il progetto ruota intorno a due assi principali:

1. Flusso documentale vivo: `import_unificato` e `import_fatture`
2. Flusso contabile vivo: `contabilita`, con registrazione, prima nota, consultazione, liquidazioni IVA, stampe e archivi

Il rischio architetturale piu alto non e nel codice "nuovo", ma nelle compatibilita storiche ancora presenti. In particolare:

- `import_fatture` riusa il motore di `import_unificato`
- `api/document.js` e `api/ai.js` accettano forme di payload legacy
- `prima_nota_guidata` contiene fallback per vecchi campi IVA
- `routeDocument` in `src/core/workflow.js` esiste ma non ha uso reale
- `import_nuovo`, `iva`, `LegacyModuloCU` e `ImportFattureView` sono punti che sembrano vivi ma non lo sono piu come flussi principali

Conclusione:

- Codice vivo esiste ed e ben identificabile
- Ma il repo contiene ancora abbastanza legacy da poter deviare facilmente l'AI verso punti sbagliati
- I prossimi lavori devono stare dentro un perimetro sicuro, altrimenti il rischio di regressione e alto

## 2. Mappa moduli attivi

### 2.1 Import documenti e fatture

#### `import_unificato`
- Scopo reale: intake documentale centrale, normalizzazione file, ispezione, conferma
- File principali:
  - `src/modules/import_unificato/index.jsx`
  - `src/modules/import_unificato/application/importWorkflow.js`
- Componenti UI principali:
  - schermata import
  - schermata di inspection
  - conferma finale documento
- Servizi/helper principali:
  - `processImportedFiles`
  - `inspectImportedFiles`
  - `inspectImportedFilesForFatture`
  - `confirmImportedDocument`
- Input:
  - file upload
  - societa
  - clienti
  - piano conti
  - causali
- Output:
  - documenti importati o staged
  - summary di processazione
- Moduli precedenti:
  - upload esterno o file system
- Moduli successivi:
  - `contabilita`
- Dipendenze reali attive:
  - `documenti_import`
  - `documenti_contabilita`
  - `societa`
  - `clienti`
  - `piano_conti`
  - `causali_iva`
- Dipendenze sospette verso codice vecchio:
  - condivide motore con `import_fatture`
  - il doppio uso del workflow e il supporto a `invoiceImportOnly` possono mascherare differenze operative

#### `import_fatture`
- Scopo reale: working view avanzata per fatture, con archivio, IVA, conferma e passaggio alla contabilita
- File principali:
  - `src/modules/import_fatture/index.jsx`
  - `src/modules/import_fatture/application/importFattureArchivioBridge.js`
  - `src/modules/import_fatture/application/importFattureContabilitaFinalize.js`
  - `src/modules/import_fatture/application/importFattureIvaProposal.js`
  - `src/modules/import_fatture/application/importFattureWorkingViewGuards.js`
  - `src/modules/import_fatture/application/importFattureCausaleContabileProposal.js`
  - `src/modules/import_fatture/application/importFattureContoProposal.js`
- Componenti UI principali:
  - working view
  - archivio fatture
  - blocchi dati operativi
  - blocchi dati contabili
  - blocchi dati IVA
- Servizi/helper principali:
  - `buildImportFattureIvaProposal`
  - `evaluateImportFattureStructuralAccountingBlocks`
  - `validateImportFattureStructuralForArchivio`
  - `insertImportFattureIntoDocumentiContabilita`
  - `syncImportFattureDocumentoContabilitaFromImportDoc`
  - `confermaERegistraDocumentoContabilitaDaArchivio`
- Input:
  - file XML/PDF/ZIP/P7M
  - documenti importati
  - piano conti
  - causali IVA
  - blob working
- Output:
  - documento fattura strutturato
  - dati contabili
  - dati IVA
  - conferma verso contabilita
- Moduli precedenti:
  - `import_unificato`
- Moduli successivi:
  - `contabilita`
- Dipendenze reali attive:
  - reuso del motore di import unificato
  - bridge verso documenti contabili
  - finalize verso workflow di registrazione
- Dipendenze sospette verso codice vecchio:
  - diverse sezioni del file sono marcate come legacy o compatibilita
  - il modulo contiene una interfaccia ibrida tra nuova working view e vecchi salvataggi

#### `fatture_ade`
- Scopo reale: import e normalizzazione fatture ADE/XML/P7M con logica ampia e opaca
- File principali:
  - `src/modules/fatture_ade/index.jsx`
- Stato:
  - attivo nel router
  - ma difficile da auditare completamente per complessita e struttura
- Rischio:
  - alto, perche sembra un modulo di ingest storico con molte responsabilita miste

### 2.2 Contabilita

#### `contabilita`
- Scopo reale: centro operativo della contabilita
- File principali:
  - `src/modules/contabilita/index.jsx`
  - `src/modules/contabilita/views/PrimaNotaHubView.jsx`
  - `src/modules/contabilita/da_validare_split_view.jsx`
  - `src/modules/contabilita/prima_nota_guidata.jsx`
  - `src/modules/contabilita/views/ConsultazionePartiteView.jsx`
  - `src/modules/contabilita/views/ImportStoricoNesView.jsx`
  - `src/modules/contabilita/views/ArchivioStoricoAIView.jsx`
  - `src/modules/contabilita/views/TaxComplianceView.jsx`
  - `src/modules/contabilita/views/StampeView.jsx`
  - `src/modules/contabilita/views/BankingView.jsx`
  - `src/modules/contabilita/views/AnagraficheContabiliView.jsx`
- Componenti UI principali:
  - da validare
  - prima nota guidata
  - consultazione partite
  - archivio storico AI
  - import storico NES
  - liquidazioni IVA
  - LIPE
  - corrispettivi
  - 770
  - intrastat
  - IVA annuale
  - percipienti
  - ritenute
  - stampe
  - banking
  - anagrafiche contabili
- Servizi/helper principali:
  - `registraDocumentiConfermati`
  - `finalizeGuidedPrimaNotaRegistration`
  - `createPrimaNotaCompleta`
  - `buildCuRowsFromPayments`
  - `buildArchivioStoricoAiGroups`
  - `filterArchivioStoricoAiGroups`
  - `buildNesHistoricalPreview`
  - `buildNesHistoricalGroups`
- Input:
  - documenti confermati
  - movimenti
  - pagamenti
  - anagrafiche
  - dati fiscali
- Output:
  - prima nota
  - registrazioni contabili
  - partitario
  - registri IVA
  - stampe
  - dati fiscali
- Dipendenze sospette verso codice vecchio:
  - `prima_nota_guidata` conserva fallback legacy per vecchi campi IVA
  - l'area anagrafiche contiene un componente `ImportFattureView` non usato

#### `f24`
- Scopo reale: gestione scadenze e righe F24
- File principali:
  - `src/modules/f24/index.jsx`
- Output:
  - scadenze F24
  - righe F24
  - import da XML
- Stato:
  - vivo
- Sospetto:
  - usa utilita di parsing e suggerimento che sembrano storiche ma sono ancora operative

#### `cu`
- Scopo reale: CU / 770 attivo
- File principali:
  - `src/modules/cu/index.jsx`
- Output:
  - righe CU
  - righe 770
- Stato:
  - vivo
- Sospetto:
  - il file contiene anche `LegacyModuloCU`, che non risulta agganciato al router

#### Moduli fiscali e di supporto vivi
- `src/modules/agecon/index.jsx`
- `src/modules/revisione_dich/index.jsx`
- `src/modules/ammortamenti/index.jsx`
- `src/modules/simulatore/index.jsx`
- `src/modules/clienti/index.jsx`
- `src/modules/utenti/index.jsx`
- `src/modules/impostazioni/index.jsx`
- `src/modules/impostazioni_procedure/index.jsx`
- `src/modules/deleghe/index.jsx`
- `src/modules/dashboard/index.jsx`
- `src/modules/richieste_fatture/index.jsx`
- `src/modules/export_dati/index.jsx`

### 2.3 Moduli con stato ibrido o da leggere con cautela

#### `lettura_mail`
- Stato reale:
  - modulo presente nel router
  - ma le azioni principali sono disattivate con alert espliciti
- Rischio:
  - si presenta come vivo ma non e un flusso operativo affidabile

#### `iva`
- Stato reale:
  - file presente, export presente
  - ma non agganciato al routing principale
- Rischio:
  - modulo legacy che puo confondere il reverse engineering

## 3. Mappa delle funzioni e delle chiamate rilevanti

### Flusso import

- `processImportedFiles`
  - File: `src/modules/import_unificato/application/importWorkflow.js`
  - Scopo: processare file importati e creare staging
  - Richiamata da: `import_unificato`, `import_fatture`
  - Richiama: parsing, persistenza, summary
  - Flusso attivo: si
  - Legacy o sospetto: forse, per il riuso cross-modulo
  - Rischio: alto

- `inspectImportedFilesForFatture`
  - File: `src/modules/import_unificato/application/importWorkflow.js`
  - Scopo: inspection dedicata al flusso fatture
  - Richiamata da: `import_fatture`
  - Richiama: logiche di analisi fatture
  - Flusso attivo: si
  - Legacy o sospetto: forse
  - Rischio: alto

- `confirmImportedDocument`
  - File: `src/modules/import_unificato/application/importWorkflow.js`
  - Scopo: confermare il documento importato
  - Richiamata da: UI di import
  - Richiama: salvataggio e conferma
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: medio-alto

- `insertImportFattureIntoDocumentiContabilita`
  - File: `src/modules/import_fatture/application/importFattureArchivioBridge.js`
  - Scopo: bridge tra archivio fatture e documenti contabili
  - Richiamata da: `import_fatture`
  - Richiama: persistenza verso `documenti_contabilita`
  - Flusso attivo: si
  - Legacy o sospetto: si, e un ponte storico delicato
  - Rischio: alto

- `syncImportFattureDocumentoContabilitaFromImportDoc`
  - File: `src/modules/import_fatture/application/importFattureArchivioBridge.js`
  - Scopo: sincronizzare il documento contabile con lo stato dell'import fatture
  - Richiamata da: `import_fatture`
  - Richiama: update/sync dati documento
  - Flusso attivo: si
  - Legacy o sospetto: si
  - Rischio: alto

- `confermaERegistraDocumentoContabilitaDaArchivio`
  - File: `src/modules/import_fatture/application/importFattureContabilitaFinalize.js`
  - Scopo: finalizzare la contabilizzazione dalla working view archivio
  - Richiamata da: `import_fatture`
  - Richiama: `registraDocumentiConfermati`
  - Flusso attivo: si
  - Legacy o sospetto: si, per il layering storico
  - Rischio: alto

- `buildImportFattureIvaProposal`
  - File: `src/modules/import_fatture/application/importFattureIvaProposal.js`
  - Scopo: creare proposta IVA dal documento
  - Richiamata da: `import_fatture`
  - Richiama: estrazione righe IVA e mapping causali
  - Flusso attivo: si
  - Legacy o sospetto: si
  - Rischio: alto

- `evaluateImportFattureStructuralAccountingBlocks`
  - File: `src/modules/import_fatture/application/importFattureWorkingViewGuards.js`
  - Scopo: validare blocchi strutturali della working view
  - Richiamata da: `import_fatture`
  - Richiama: controlli guardrail
  - Flusso attivo: si
  - Legacy o sospetto: si
  - Rischio: alto

### Flusso contabilita

- `registraDocumentiConfermati`
  - File: `src/modules/contabilita/application/contabilitaRegistrationWorkflow.js`
  - Scopo: registrare documenti confermati in contabilita
  - Richiamata da: contabilita, import fatture
  - Richiama: `createPrimaNotaCompleta`, finalize, sync IVA
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: altissimo

- `finalizeGuidedPrimaNotaRegistration`
  - File: `src/modules/contabilita/application/contabilitaRegistrationWorkflow.js`
  - Scopo: chiudere la registrazione guidata
  - Richiamata da: `prima_nota_guidata`
  - Richiama: finalize documenti e scritture
  - Flusso attivo: si
  - Legacy o sospetto: forse
  - Rischio: alto

- `createPrimaNotaCompleta`
  - File: `src/services/primaNotaService.js`
  - Scopo: creare la prima nota completa
  - Richiamata da: workflow di registrazione
  - Richiama: create/save PN, normalizzazioni
  - Flusso attivo: si
  - Legacy o sospetto: si, per gli alias legacy
  - Rischio: alto

- `runFullPipeline`
  - File: `src/services/pipelineService.js`
  - Scopo: orchestrazione end to end del documento
  - Richiamata da: `services/api/document/process.js`, `src/utils/autoPipeline.js`
  - Richiama: parsing, ai accounting, partitari, iva, liquidazione, insight
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: altissimo

- `runParsing`
  - File: `src/services/aiParsingService.js`
  - Scopo: parsing AI o compatibile
  - Richiamata da: `runFullPipeline`
  - Richiama: logiche di parsing e normalizzazione
  - Flusso attivo: si
  - Legacy o sospetto: si, per il wrapper backward compatible
  - Rischio: alto

- `runAiAccounting`
  - File: `src/services/aiAccountingService.js`
  - Scopo: costruire la proposta contabile AI
  - Richiamata da: `runFullPipeline`
  - Richiama: logiche AI contabili
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: altissimo

- `buildCuRowsFromPayments`
  - File: `src/modules/contabilita/application/paymentDrivenFiscalViews.js`
  - Scopo: creare righe CU da pagamenti
  - Richiamata da: `src/modules/cu/index.jsx`
  - Richiama: logiche di mapping fiscale
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: medio

- `buildArchivioStoricoAiGroups` e `filterArchivioStoricoAiGroups`
  - File: `src/modules/contabilita/application/archivioStoricoAiService.js`
  - Scopo: raggruppare e filtrare archivio AI
  - Richiamate da: `ArchivioStoricoAIView`
  - Flusso attivo: si
  - Legacy o sospetto: no evidente
  - Rischio: medio

### Router e compatibilita

- `callBackend`
  - File: `src/core/workflow.js`
  - Scopo: wrapper generico per chiamate backend
  - Richiamata da: CU, simulatore e altri flussi
  - Flusso attivo: si
  - Legacy o sospetto: no
  - Rischio: medio

- `routeDocument`
  - File: `src/core/workflow.js`
  - Scopo: routing vecchio dei documenti
  - Richiamata da: nessun call site reale trovato
  - Flusso attivo: no probabile
  - Legacy o sospetto: si
  - Rischio: alto, perche sembra un centro architetturale ma non lo e piu

- `aiParsingService(...)`
  - File: `src/services/aiParsingService.js`
  - Scopo: helper backward compatible
  - Richiamata da: altri layer compat
  - Flusso attivo: si, ma come shim
  - Legacy o sospetto: si
  - Rischio: medio-alto

## 4. Inventario legacy / in disuso / sospetto

### Da congelare

- `src/modules/import_nuovo/index.jsx`
  - Motivo: il router principale lo bypassa verso `import_unificato`
  - Evidenza: `App.jsx` intercetta `import_nuovo` e reindirizza
  - Richiami: solo redirect e file stesso
  - Impatto potenziale: l'AI puo prenderlo per il flusso giusto
  - Classificazione: legacy forte
  - Azione ora: congelare

- `src/modules/iva/index.jsx`
  - Motivo: modulo presente ma non agganciato al routing attivo
  - Evidenza: export presente, nessun uso nel router
  - Richiami: nessuno rilevante
  - Impatto potenziale: riuso di una struttura IVA superata
  - Classificazione: legacy forte
  - Azione ora: congelare

- `src/core/workflow.js::routeDocument`
  - Motivo: funzione importante solo nel nome, non nell'uso reale
  - Evidenza: definita ma senza call site
  - Richiami: nessuno trovato
  - Impatto potenziale: falsa base architetturale
  - Classificazione: morto probabile
  - Azione ora: candidare a futura rimozione

- `src/modules/cu/index.jsx::LegacyModuloCU`
  - Motivo: componente legacy non agganciato
  - Evidenza: definito, ma non usato dal router
  - Richiami: nessuno trovato
  - Impatto potenziale: confusione tra CU attivo e CU vecchio
  - Classificazione: legacy forte
  - Azione ora: congelare

- `src/modules/contabilita/views/AnagraficheContabiliView.jsx::ImportFattureView`
  - Motivo: componente definito ma non usato
  - Evidenza: funzione interna presente, nessuna referenza esterna
  - Richiami: nessuno trovato
  - Impatto potenziale: falsa UI di import
  - Classificazione: morto probabile
  - Azione ora: candidare a futura rimozione

### Da leggere ma non usare

- `src/modules/lettura_mail/index.jsx`
  - Motivo: modulo presente ma operativamente disattivato
  - Evidenza: alert che dichiara la disattivazione temporanea
  - Richiami: UI ancora presente
  - Impatto potenziale: sembra vivo ma non lo e
  - Classificazione: legacy probabile
  - Azione ora: leggere ma non usare

- `src/modules/import_fatture/index.jsx` sezioni legacy
  - Motivo: il modulo e vivo, ma ha blocchi legacy espliciti
  - Evidenza: commenti su sezione legacy, dati IVA opzionali, campi legacy
  - Richiami: chiamate interne al modulo
  - Impatto potenziale: introduzione di microfix inutili e regressioni di UI
  - Classificazione: vivo ma legacy interno
  - Azione ora: leggere ma non usare come base per nuovi pattern

- `api/document.js`
  - Motivo: gateway compatibile con payload vecchi
  - Evidenza: commenti e branching su forme legacy
  - Richiami: endpoint attivo
  - Impatto potenziale: routing sbagliato se si usa una forma obsoleta
  - Classificazione: legacy probabile
  - Azione ora: leggere ma non usare per nuovi contratti

- `api/ai.js`
  - Motivo: gateway AI con compatibilita storica
  - Evidenza: supporto a payload legacy e routing multi-forma
  - Richiami: endpoint attivo
  - Impatto potenziale: invocazioni errate del backend AI
  - Classificazione: legacy probabile
  - Azione ora: leggere ma non usare

### Da valutare in futuro per rimozione

- `src/modules/import_nuovo/index.jsx`
- `src/modules/iva/index.jsx`
- `src/core/workflow.js::routeDocument`
- `src/modules/cu/index.jsx::LegacyModuloCU`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx::ImportFattureView`
- parti legacy esplicite di `src/modules/import_fatture/index.jsx`
- payload compat vecchi in `api/document.js`
- payload compat vecchi in `api/ai.js`

## 5. Perimetro sicuro per i prossimi lavori

### 5.1 Codice attivo da usare

- `src/modules/import_unificato`
- `src/modules/import_fatture` nelle parti working/bridge attive
- `src/modules/contabilita`
- `src/modules/f24`
- `src/modules/cu` ramo attivo
- `src/modules/agecon`
- `src/modules/revisione_dich`
- `src/modules/ammortamenti`
- `src/modules/simulatore`
- `src/modules/clienti`
- `src/modules/utenti`
- `src/modules/impostazioni`
- `src/modules/impostazioni_procedure`
- `src/modules/deleghe`
- `src/modules/dashboard`
- `src/modules/richieste_fatture`
- `src/modules/export_dati`
- `services/pipelineService.js`
- `services/aiParsingService.js`
- `services/aiAccountingService.js`
- `services/primaNotaService.js`
- `services/liquidazioneIvaService.js`
- `services/fiscalOutputService.js`
- `services/pipelineLedgerSyncService.js`
- `services/partitarioSyncService.js`
- `services/ivaRegistriSyncService.js`
- `services/registerDocumentoPrimaNotaFromContabilita.js`

### 5.2 Codice di contesto da leggere ma non usare

- `api/document.js`
- `api/ai.js`
- `src/core/workflow.js` salvo `callBackend`
- `services/aiParsingService.js` wrapper compat
- `services/primaNotaService.js` con alias legacy
- `src/modules/contabilita/prima_nota_guidata.jsx` nei fallback legacy
- `src/modules/import_fatture/index.jsx` nelle sezioni legacy
- `src/modules/lettura_mail/index.jsx` come shell disattivata

### 5.3 Codice legacy da congelare

- `src/modules/import_nuovo`
- `src/modules/iva`
- `src/core/workflow.js::routeDocument`
- `src/modules/cu/index.jsx::LegacyModuloCU`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx::ImportFattureView`

### 5.4 Codice da valutare in futuro per rimozione

- tutto il legacy congelato sopra
- i compat payload di `api/document.js`
- i compat payload di `api/ai.js`
- le sezioni legacy interne di `import_fatture`

## 6. Top rischi attuali

1. `import_fatture` e `import_unificato` condividono il motore
2. `api/document.js` e `api/ai.js` accettano payload legacy
3. `prima_nota_guidata` conserva fallback storici per vecchi campi IVA
4. `lettura_mail` appare vivo ma e disattivato
5. `routeDocument` sembra un centro architetturale ma non ha uso reale
6. `fatture_ade` e un'area ampia e opaca, quindi ad alto rischio di interpretazione errata

## 7. Zone da congelare subito

- `src/modules/import_nuovo/index.jsx`
- `src/modules/iva/index.jsx`
- `src/core/workflow.js::routeDocument`
- `src/modules/cu/index.jsx::LegacyModuloCU`
- `src/modules/contabilita/views/AnagraficheContabiliView.jsx::ImportFattureView`
- `src/modules/lettura_mail/index.jsx` come flusso operativo
- sezioni legacy esplicite in `src/modules/import_fatture/index.jsx`
- payload legacy in `api/document.js`
- payload legacy in `api/ai.js`

## 8. Cose da non usare piu nei task futuri

- Non usare `import_nuovo` come base del flusso import attuale
- Non usare `iva` come sorgente della liquidazione IVA attuale
- Non usare `routeDocument` come router documentale di riferimento
- Non usare `LegacyModuloCU` come implementazione CU attiva
- Non usare `ImportFattureView` interna alle anagrafiche come UI di import
- Non usare `lettura_mail` come canale operativo affidabile
- Non costruire nuovi flussi su payload legacy di `api/document.js`
- Non costruire nuovi flussi su payload legacy di `api/ai.js`
- Non trattare i fallback legacy di `prima_nota_guidata` come modello canonico

---

Se serve, il passo successivo utile e creare una seconda versione di questo file piu operativa, con:

- tabella file per file
- lista call site
- lista "non toccare"
- lista "sicuro da usare"

