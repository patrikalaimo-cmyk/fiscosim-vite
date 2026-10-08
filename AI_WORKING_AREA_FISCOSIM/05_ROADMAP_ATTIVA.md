# ROADMAP ATTIVA — SVILUPPO LIQUIDAZIONE IVA DEFINITIVA E REGISTRI IVA

L'attività corrente ha completato con successo il modulo **Liquidazione IVA Definitiva / Chiusura UX / Export** ed ha avviato la preparazione per la fase successiva.

## Stato dei Lavori

```
+------------------------------------------------------------+
| FASE 12: Liquidazione IVA Chiusura UX & Export (COMPLETATO ✔) |
+------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------+
| FASE 13: Registri IVA e stampe definitive (PROSSIMO STEP ⏳)  |
+------------------------------------------------------------+
```

## Dettaglio dell'Ultima Fase Completata (Fase 12)

1. **Blocco e Protezione Periodi Definitivi (COMPLETATO ✔)**:
   * Implementata la protezione rigida dei periodi contabili con stato `definitiva`. I consolidamenti e i riconsolidamenti vengono bloccati con avviso operativo: `“Liquidazione definitiva: il periodo è bloccato e non può essere riconsolidato.”`.
   * Aggiunti alert per il riconsolidamento delle provvisorie e verifica preventiva per l'eventuale invio LIPE già effettuato.

2. **Logica di Fallback `savedRecord` (COMPLETATO ✔)**:
   * Modificato `buildLiquidazioneIvaProspettoModel.js` in modo da abilitare il fallback sui totali consolidati solo se il calcolo non ha dettagli reali e si sta visualizzando/esportando un record già salvato (`options.isSaved === true`).

3. **Nota Operativa in Tutti gli Export (COMPLETATO ✔)**:
   * Cablata la nota operativa ministeriale/diagnostica per l'assenza di dettagli righe su Prospetto, CSV, HTML, XLSX ed export del cliente.

4. **Correzione Sintassi Export XLSX (COMPLETATO ✔)**:
   * Risolti gli errori di compilazione relativi alla troncature sintattiche in `buildLiquidazioneIvaExportModel.js`.

5. **Passaggio Test e Compilazione Build (COMPLETATO ✔)**:
   * Eseguiti con successo tutti i 101 test relativi alla liquidazione IVA.
   * Compilata la build di produzione (`npm run build`) con successo.

## Riallineamento A100 — 2026-10-06

La roadmap operativa corrente è stata riallineata all'obiettivo **A100 — Studio Interno Completo**.

Stato attuale:
- **TEST-BASELINE-1: COMPLETATO**. GitHub Actions run `37523777654` verde su Linux e Windows con `test:import`, `test:core`, `test:all` e `npm run build`.
- **IMPORT-25A-FREEZE: GATE AUTOMATICO COMPLETATO; COLLAUDO MANUALE FINALE DEFERITO**.
- **IMPORT-25A-HISTORY-1: CHIUSO VERDE**.
- **IMPORT-25A-HISTORY-2: CHIUSO VERDE**.
- Audit automatico finale Import: PASS. Su autorizzazione operativa del 07/10/2026, i collaudi manuali vengono accorpati alla fase finale; lo sviluppo prosegue ora su **MANUALE-CANONICO-FREEZE**. Ogni blocco resta marcato “automatico verde / manuale pendente” finché il collaudo non è eseguito.
- **Registrazione Manuale, Consultazione e IVA** restano nella sequenza di freeze prevista dopo Import.
- **Riconciliazione Bancaria resta BLOCCATA** finché Import + Manuale + IVA non sono chiusi con test automatici e collaudo manuale finale di blocco.

Ordine A100 attivo:
1. IMPORT-25A-FREEZE.
2. MANUALE-CANONICO-FREEZE.
3. CONSULTAZIONE-FREEZE.
4. IVA-REGISTRI-LIQUIDAZIONE.
5. SPLIT-SIMPLE.
6. RITENUTE-SCADENZARIO.
7. STAMPE-EXPORT-FASCICOLO.
8. LOCK-PERIODO-AUDIT.
9. RICONCILIAZIONE BANCARIA ASSISTITA.
10. RELEASE A100.

Nel blocco Import, le proposte da storico devono restare assistive: il software propone, segnala discrepanze e preserva gli override manuali; la contabilizzazione richiede sempre validazione utente.



## Regola collaudi differiti — 2026-10-07

Per accelerare lo sviluppo:
- i test automatici e la CI restano obbligatori a ogni blocco;
- i collaudi manuali browser/utente vengono registrati come debito di collaudo e accorpati in una sessione finale;
- nessun collaudo manuale viene dichiarato eseguito se non realmente svolto;
- Riconciliazione Bancaria resta bloccata finché Import + Manuale + IVA non hanno gate automatici verdi e i collaudi manuali richiesti non sono stati validati;
- RELEASE A100 resta bloccata fino alla chiusura di tutto il debito manuale.


## MANUALE-CANONICO-FREEZE — gate automatico 2026-10-07

- Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Commit codice validato: `1cbcfbbd7c896650df2ab9fc7ee3c57fc22cd990`.
- CI run `37662134584`: Ubuntu e Windows verdi su `test:import`, `test:manual`, `test:core`, `test:all` e build.
- Profilo Manuale ufficiale: 29 file / 413 test; reincluse anche le suite application `persistPrimaNotaDraft.test.js` e `buildContabilitaPostPersistOutput.test.js`.
- Audit UI: nessun write contabile diretto dalla Registrazione Manuale verso prima nota, righe, registri IVA, partitario o ritenute; persistenza principale condivisa e canonica.
- Il freeze automatico copre movimenti generali, fatture IVA attive/passive, note credito, multi-aliquota, split payment, IVA per cassa, reverse charge/autofatture/estero, partitario, ritenute, cespiti accessori e blocchi periodo.
- I collaudi manuali sono registrati in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md` e non sono dichiarati eseguiti.
- **Prossimo blocco attivo: CONSULTAZIONE-FREEZE**.
- **Riconciliazione Bancaria resta BLOCCATA** fino al gate previsto su Import + Manuale + IVA.


## CONSULTAZIONE-FREEZE — gate automatico 2026-10-07

- Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Commit codice validato: `66952c229a9b6e6dd8bac329b664a5537c2f88d3`.
- CI run `37664771687`: Ubuntu e Windows verdi su Import, Manuale, Consultazione, Core, All safe e build.
- Profilo `test:consultazione`: 5 file / 38 test PASS.
- Chiuso un bypass reale del contratto read-only: la sidebar non può più modificare, stornare o eliminare simulazioni e il parent non passa più callback mutative verso il Manuale.
- Filtri, dettaglio, saldi, stati ed export restano operativi in sola lettura.
- Collaudo browser differito e registrato nel debito QA finale.
- **Prossimo blocco attivo: IVA-REGISTRI-LIQUIDAZIONE**.
- **Riconciliazione Bancaria resta BLOCCATA**.


## IVA-REGISTRI-LIQUIDAZIONE-FREEZE — gate automatico 2026-10-07

- Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Commit hardening dati: `e612ca03e75ae6aa11ff9b5b09686ce6cfc4826a`.
- Commit gate test: `583d7d6b4cf3e3f24ba105ba321cf49ed10a6184`.
- CI run `37680695367`: Ubuntu e Windows verdi su Import, Manuale, Consultazione, IVA, Core, All safe e build.
- Profilo `test:iva`: **15 file / 148 test PASS**.
- Corretto un difetto fiscale reale: l'IVA acquisti esplicitamente indetraibile (`iva_detraibile = 0`) non viene più trasformata in IVA integralmente detraibile da un fallback truthy.
- Corretto il mapping split payment e rimossi fallback UX dimostrativi su conteggio registri, operatore e metodo di calcolo.
- Rafforzato il tenant scope di registri, causali IVA e snapshot di liquidazione.
- Il percorso Tax Compliance congelato usa il dominio/applicazione IVA canonico; residui legacy basati su `accounting_entries` restano confinati ad altri percorsi storici e non vengono dichiarati rimossi.
- Nessuna migration applicata e nessuna verifica su dati reali.
- Collaudo browser differito e registrato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.
- **Prossimo blocco attivo: SPLIT-SIMPLE**.
- **Riconciliazione Bancaria resta BLOCCATA** fino alla chiusura del gate manuale previsto su Import + Manuale + IVA.


## SPLIT-SIMPLE-FREEZE — gate automatico 2026-10-08

- Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Commit codice validato: `91d2365a2efa9a19f099bde61fc12a95a1bd162d`.
- CI run `37695652369`: Ubuntu e Windows verdi su Import, Manuale, Consultazione, IVA, Split, Core, All safe e build.
- Profilo `test:split`: **3 file / 25 test PASS**.
- Il caso semplice congelato copre fattura attiva verso cliente split: rilevazione da anagrafica/documento, conto tecnico configurato, partitario al solo imponibile, registro IVA con evidenza split ed esclusione dal debito IVA effettivo.
- Corretto il segno della controparte per nota credito attiva split: il builder Manuale preserva il lato Avere invece di forzare il Dare, riallineandosi al workflow Import.
- Il conto tecnico split resta configurabile; nessun codice conto fiscale hardcoded è introdotto.
- Collaudo browser differito e registrato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.
- **Prossimo blocco attivo: RITENUTE-SCADENZARIO**.
- **Riconciliazione Bancaria resta BLOCCATA**.


## RITENUTE-SCADENZARIO-FREEZE — gate automatico 2026-10-08

- Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Commit hardening architetturale: `56b173b05ae9b2d84f0993318ba91d382ecee642`.
- Commit fix priorità aliquota configurata: `9fb3b04782a7dc41d8846022a69746e15e530130`.
- CI run `37697140035`: Ubuntu e Windows verdi su Import, Manuale, Consultazione, IVA, Split, Ritenute, Core, All safe e build.
- Profilo `test:ritenute`: **4 file / 27 test PASS**.
- Eliminato il bypass legacy “Nuovo pagamento” dalla vista Tax Compliance: lo scadenzario ritenute è ora read-only e deriva solo dai pagamenti contabilizzati nel workflow canonico.
- CU/770 “pronto” richiede anche il codice fiscale del percipiente.
- L'aliquota ritenuta deve provenire da configurazione esplicita su draft/causale/percipiente; rimosse euristiche testuali fiscali.
- Query operative ritenute verificate tenant-scoped.
- Limite residuo A100: **pagamento parziale con ritenuta non ancora supportato** e attualmente bloccato esplicitamente. Deve essere implementato o escluso formalmente prima della RELEASE A100.
- Collaudo browser differito in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.
- **Prossimo blocco attivo: STAMPE-EXPORT-FASCICOLO**.
- **Riconciliazione Bancaria resta BLOCCATA**.


## STAMPE-EXPORT-FASCICOLO — hardening intermedio 2026-10-08

- Stato: **IN CORSO / NON FREEZE**.
- Hardening GitHub: `74e5cd1748222131134b17b7d880aee2c40d694b`; test portabilità `a2e2a4ec258091cd22b6a0d3da887f4490b76de4`.
- Profili nuovi: `test:stampe`, CI Ubuntu e Windows. Il superamento non equivale a completamento del blocco.
- Non esporre più nella vista Stampe i fac-simile storici Partitari/Mastrini/Bilancio: presentare stato non operativo finché non collegati al canonico.
- Gli export da Registri IVA verificano tenant scope degli arricchimenti e abortiscono se manca la relazione Prima Nota o la causale richiesta.
- I registri e il giornale non esportano silenziosamente dataset potenzialmente troncati dalla lettura non paginata a 1000 righe: blocco temporaneo da sostituire con paginazione completa.
- Rimossa falsa indicazione pagina unica dagli HTML provvisori.
- **Restano da completare prima del freeze:** fascicolo cliente PDF unico, modelli canonici Partitari/Mastrini/Bilancio, paginazione dataset grandi, hash connesso al contenuto effettivo di stampa, numerazione e audit definitivo, eliminazione completa codice demo, E2E browser/PDF.
- Requisito residuo precedente: pagamento parziale con ritenuta non ancora supportato, esplicitamente bloccato.
- Riconciliazione Bancaria resta **BLOCCATA**. Nessun collaudo manuale dichiarato eseguito.


## Decisione operativa 2026-10-08 — Sblocco SVILUPPO Riconciliazione Bancaria (non produzione)

Su disposizione esplicita dell'utente, il vincolo storico "Riconciliazione Bancaria BLOCCATA" è modificato **per lo sviluppo**. Le sezioni datate precedenti rimangono traccia storica, non costituiscono il gate operativo più recente.

**DA ORA CONSENTITO IN PARALLELO A STAMPE-EXPORT-FASCICOLO:**
- audit, dominio, parser, normalizzazione, matching e Working View Bank;
- test automatici con fixture sintetiche;
- mapping e validazione verso il contratto contabile canonico esistente;
- progettazione/test del commit transazionale atomico e dell'idempotenza senza attivazione reale;
- studio di importo/direzione, saldo estratto conto, movimentazioni interne/giroconti, gestione partite e dei blocker fiscali.

**ANCORA VIETATO:**
- commit reale o persist su società operative prima del gate tecnico e manuale;
- scrittura tramite sequenze multiple anziché RPC/servizio transazionale atomico;
- migrazioni Supabase live, policy auth/RLS, credenziali/env senza permesso;
- bypass operator validation, scritture silenti, matching fiscalmente autorevole;
- rilascio del modulo Bank in produzione prima del collaudo manuale Import+Manuale+IVA e del collaudo Bank specifico.

Sequenza aggiornata: STAMPE-EXPORT-FASCICOLO e BANK-DEV procedono in parallelo; LOCK-PERIODO-AUDIT e Release A100 restano gated dalla loro matrice e dai collaudi. Il nuovo `test:bank` è una baseline di sicurezza, **non** certifica il commit transazionale reale né l'E2E.

Prima correzione Bank: `validateCanonicalReconciliationPayload` non può più rendere valido un ignored con blocker o contesto assente; un ignored non può avere nemmeno testata PN. Compatibilità fixture R8/R9A da gate CI.

Rimane non chiuso il requisito residuo: pagamento parziale di parcella con ritenuta.


## Aggiornamento 2026-10-08 — BANK-DEV e stampe dati voluminosi

- BANK-DEV: primo gate `37701343937` verde su Ubuntu e Windows. Validazione ignored corretta; resta proibita l'attivazione su società reali finché non esiste e viene validato il commit atomico.
- STAMPE: sostituzione del vecchio blocker a 1000 righe con paginazione completa e join in batch. Il codice è in validazione CI; stampe non congelate.
- Requisiti residui Stampe: fascicolo PDF unico; Mastrini/Bilancio/Partitari canonici; hash del contenuto; verifica consistenza in concorrenza; browser e PDF E2E.
- Sviluppo Bank e Stampe rimane parallelo. Release A100 e commit bancario reale restano gated dai rispettivi collaudi.


## Checkpoint verde 2026-10-08 — BANK-DEV + STAMPE

- `31219e6` Bank safety: CI `37701343937` PASS su Ubuntu/Windows.
- `286f0fd` Stampe pagination: CI `37701699556` PASS su Ubuntu/Windows.
- Stampe ora legge registri IVA e Giornale paginati e completi, con errori espliciti su anomalie; non è ancora la versione definitiva del fascicolo.
- Sviluppo Riconciliazione Bancaria attivo, commit reale bloccato fino ai gate.
- I blocchi LOCK-PERIODO-AUDIT e RELEASE A100 mantengono i propri prerequisiti; pagamenti parziali con ritenuta restano requisito residuo.


## Checkpoint 2026-10-08 — BANK-DEV identità contabile + STAMPE modelli per conto

- **BANK-DEV**: `ad773a5bdf37c0afdd59ba50e6a8569042295697`, CI `37737965871` **SUCCESS** Ubuntu/Windows. Il commit input identifica il singolo `movementId` come `sourceDocumentId`, non l'estratto conto; validazione richiede movimento+decisione, blocca mismatch società/esercizio/conto e sezioni PN non riconosciute.
- **Stampe CSV**: `d0bb3ed7214a4f609a3a20b1ea9570411517f190`, CI `37738239233` **SUCCESS** Ubuntu/Windows. Neutralizzazione delle formule nei dati testuali dei CSV Registro IVA e Giornale.
- **Stampe dominio**: `552470928f41276bf1e169779d1f3b15e9799f6f`, CI `37738561308` **SUCCESS** Ubuntu/Windows. Nuovo `buildMovimentiPerContoModel`: movimenti contabili e saldi periodici Dare/Avere da PN canonica, in centesimi, con guardrail per società, periodo, quadratura, stato e dati incompleti.
- **Non è il bilancio definitivo:** il nuovo modello non ricostruisce saldi iniziali/esercizi precedenti; non è ancora esposto nella UI.
- **STAMPE-EXPORT-FASCICOLO resta IN CORSO / NON FREEZE**: necessario fascicolo PDF unico, collegamento UI reale Partitari/Mastrini/Bilancio, saldi iniziali/classificazione, checksum su contenuti effettivi, snapshot coerente e collaudo PDF/browser.
- **BANK-DEV resta attivo**, ma il commit reale e la release bancaria restano vietati finché non saranno validati RPC atomica, audit/idempotenza, tenant scope e collaudi.
- Non applicate migration; nessuna modifica auth/RLS/env o dati di società reali.


## Avanzamento 2026-10-08 — STAMPE saldi infrannuali per conto (P1, sottofase)

- Introdotto `buildSaldiPerContoEsercizioModel`: da PN canonica dal primo giorno dell'esercizio selezionato, separa movimenti pre-periodo e movimenti del periodo, genera saldo precedente, progressivo e saldo finale di ogni conto.
- Piano dei conti usato come fonte di identità, natura patrimoniale/economica e gerarchia; conti terminali senza movimenti esposti a zero. I campi `saldo_iniziale` del piano dei conti **non** sono usati come prova di riapertura.
- Vincoli: esercizio solare singolo, società unica, quadrature al centesimo, periodi reali, classificazioni/gerarchia e assenza doppioni. Corretto anche il filtro dello stato `storno` nel modello per conto.
- **Stato P1: PARZIALE / non freeze**. Il saldo precedente è *intraesercizio*; riapertura dai precedenti esercizi, completezza e snapshot coerente non verificati. Nessuna UI o stampa definitiva abilitata da questo intervento.
- Prossimo gate: tracciare/approntare il caricamento completo di PN e scritture di riapertura da fonte autoritativa, riconciliare saldi iniziali storici con chiusura anno precedente e solo dopo validare bilancio e mastrini finali.
- CI del nuovo intervento: PENDENTE al commit di codice.


## Gate 2026-10-08 — STAMPE saldi intraesercizio

Commit `1ec940c`, GitHub Actions `37766190172` **SUCCESS** Ubuntu/Windows; stampe 61/61, bank 11/11, core 629/629, all safe 1004/1004, build OK su entrambe le piattaforme. P1 resta parziale: saldi precedenti intraesercizio da PN canonica e piano conti verificati automaticamente; riapertura anno precedente e validazione snapshot non coperte. Stampe/Bilancio non freeze.

## Sottofase 2026-10-08 — audit raccordo esercizi / progressivi mastro (CI da validare)

- Introdotto `auditRaccordoEserciziModel`, puro/read-only: verifiche su Prima Nota esercizio precedente, identificativi ESPLICITI delle chiusure patrimoniali, scritture di riapertura e causali canoniche (`causali_contabili.tipo=chiusura/apertura`) tenant-scoped.
- Verifica finale esercizio precedente azzerato, assenza di economici nella chiusura patrimoniale/riapertura, corrispondenza di segno opposto al centesimo per conto tra chiusura e riapertura. Stati non contabilizzati, documenti fuori esercizio e input incoerenti bloccati.
- Corretto ordinamento dei progressivi di mastro nel caso di registrazioni miste con `conto_id` oppure soltanto `conto_codice`, senza perdere la cronologia tra gruppi.
- **Non è una procedura di chiusura o riapertura, non scrive PN**. Se la fonte non espone causali/ID o l'esercizio precedente non è realmente chiuso, l'audit fallisce esplicitamente. L'esito è sempre `definitive:false`: snapshot atomico, completezza della lettura e certificazione catena esercizi NON provati.
- Nessuna stampa Bilancio/Mastri sbloccata, nessuna banca live. Prossimo gate: fonte canonica completa/paginata per periodo e causali storiche, consistenza sotto concorrenza, collegamento applicativo/UI solo dopo audit contabile, workflow reale di assestamento/chiusura.

## Fix CI 2026-10-08 — conto per solo codice in PN storiche

La prima CI ha rilevato `anagrafica_conto_non_coerente` su più righe senza `conto_id`: il controllo del modello base confrontava `null` e stringa vuota. Corretto il confronto normalizzando valori assenti; aggiunta regressione in `stampeMovimentiPerContoModel.test.js`, oltre al test cronologico ID/codice. CI del fix da verificare; nessun nuovo freeze.

## 2026-10-08 — STAMPE raccordo: loader read-only del repository

- Il fix `73578a3` ha superato CI Windows/Ubuntu `37775668769`.
- Implementato `loadAuditRaccordoEsercizi(db,input)`: carica PN intera dell'esercizio precedente tramite paginazione completa, righe PN in batch, riaperture puntuali con ID obbligatori, piano dei conti e causali incluse quelle storicamente inattive.
- Esposta funzione applicativa read-only `getAuditRaccordoEserciziPerStampa(input)` in `contabilitaRepo.js`; ritorna audit e statistiche evidence con `completenessCertified:false`, `snapshotCertified:false`.
- Scope societario esplicito su tutte le intestazioni/causali/conti e join righe tramite soli ID già filtrati; fallimento esplicito su PN senza righe, ID mancanti, duplicati o errori di lettura. Nessun flusso UI o commit contabile abilitato.
- Test di lettura simulata query DB con oltre 500 PN, batch righe, inattivi storici, leakage di ID, errori e blocker. CI del loader pendente.
- Residui: snapshot transazionale da fonte DB, politica reale chiusure/riaperture e report finale certificato.

## 2026-10-08 — checksum effettivo del file in STAMPE (componente preparatorio)

- Loader read-only raccordo `dc282af`, CI `37776049729`: SUCCESS Windows/Ubuntu.
- Introdotto `hashStampaContenuto`: SHA-256 WebCrypto su byte reali del file emesso (Uint8Array/ArrayBuffer), con separazione di dominio e metadati identificativi (società, tipo, anno, periodo, MIME, lunghezza), sempre fallendo se contenuto assente/vuoto o crypto indisponibile.
- Test di determinismo, sensibilità a singolo byte, periodo, società, tipo, MIME, contenuto vuoto e fallimenti crittografici nel profilo `test:stampe`.
- **Non collegato al pannello definitivo**. `generateStampaChecksum` e la UI storica usano ancora soli metadati: non promuovere la definitività né trattare questo helper come protezione completa. Serve generazione del file reale, digest degli stessi byte archiviati, snapshot DB, lock e riscontro persistito (digest+versione) nella RPC.
- CI del componente checksum: pendente.

## 2026-10-08 — gate UI Stampa Definitiva: evidenza reale obbligatoria

- Nuovo helper SHA-256 bytes `d147b43` PASS CI `37776465805` Windows/Ubuntu.
- Audit del percorso `StampaDefinitivaPanel`: il client passava ancora `generateStampaChecksum` metadata-only alla RPC, che accetta `p_checksum` senza verifica che rappresenti il PDF. La numerazione pagine SQL non corrisponde necessariamente alla paginazione effettiva.
- Introduzione di `validateStampaDefinitivaEvidence` nel pannello e blocco fail-closed del bottone consolidamento se il precheck non attesta `snapshot_certified`, `stored_file_verified`, `checksum_verified`, `file_size_bytes > 0` e un `content_sha256` valido. Nessuna chiamata di consolidamento viene proposta dalla UI senza tali prove.
- Eliminato dal pannello l'uso del checksum da metadati: quando il nuovo protocollo server sarà pronto, il valore sarà quello attestato dal server. La RPC attuale non restituisce queste attestazioni: **il consolidamento UI viene quindi bloccato intenzionalmente**, preservando anteprime ed export provvisori.
- Non è una mitigazione completa lato server: l'RPC DB può essere richiamata esternamente finché non sarà indurita sotto migration approvata. Occorre progettare il protocollo snapshot/hash/archivio/lock transazionale, non inventare attestazioni client.
- Test del gate aggiunti, CI pendente; nessuna migration/auth/RLS/DB live, Bank live sempre vietata.

## 2026-10-08 — gate definitivo legato al tenant

- Ulteriore controllo sulla verifica: attestazioni server devono riportare stesso `societa_id`, `tipo_stampa`, `periodo_inizio`, `periodo_fine` del pannello; mismatch o attributo assente bloccano. Il cambio della società attiva invalida lo stato del precheck React.
- Regressioni: cambio tenant, periodo/tipo divergente e invalidazione dell'effetto al cambio società. Non è una sostituzione della validazione server-side nella RPC.
- CI di questa integrazione: pendente.

## Gate 2026-10-08 — audit raccordo, SHA-256 contenuto e blocco definitiva non attestata

Checkpoint codice `0b04bfd3c93648e0f333b6fef9ad4da059ee68b4`. GitHub Actions `37777207489` **SUCCESS Windows e Ubuntu**, build produzione PASS. Per ciascuna piattaforma: `test:stampe` **90/90**, `test:bank` **11/11**, `test:core` **658/658**, `test:all` **1033/1033**. Non modificati database, migrations, env, auth/RLS o società reali.

La certificazione riguarda i test automatici del codice, NON lo stato funzionale A100: il consolidamento UI è volutamente bloccato senza attestazioni server, mentre la RPC esistente non prova i byte PDF e può essere invocata aggirando la UI. Rimangono obbligatori un database di test isolato e migrazione server-side approvata per snapshot, hash file, lock e audit; test browser e verifica PDF. Bank live sempre bloccata.

## 2026-10-08 — Gate di sicurezza Stampe: Supabase collegato, database non utilizzabile

- Connesso Supabase: il progetto denominato "Fiscosim v4p" risulta INACTIVE, senza branch di sviluppo, con timeout su list_tables/list_migrations. Identità con il database operativo non verificata; nessuna query ai dati, riattivazione o modifica.
- Audit statico SQL in `REPORT/FISCOSIM_RPC_STAMPA_SERVER_SECURITY_AUDIT.md`: procedure di precheck/consolidamento `SECURITY DEFINER`, senza prova di autorizzazione utente→società né verifica effettiva dei byte del file all'interno della transazione; la configurazione reale dei permessi deve essere accertata sul DB di test. Non assumere vulnerabilità confermata sul database inattivo.
- Esteso il blocco della definitiva dal pannello al wrapper `consolidazioneStampaDefinitiva`: firma SHA-256 del file, certificazioni precheck, identità (società, anno, tipo, periodo) e checksum identico a quello attestato obbligatori prima di RPC; blocco sicuro senza invocare la RPC in mancanza.
- Test simulati della precedente paginazione/numero/protocolli mantengono mock di **server fittizio attestante** per non rappresentarli come evidenza del database reale; aggiunti test fail-closed del service per mancanza prova, SHA discordante, identità intertenant.
- **Non è un freeze**: l'RPC SQL sottostante resta da indurire/testare server-side su database isolato, poi fascicolo PDF e UI finali. CI da validare.

## Checkpoint 2026-10-08 — Fiscosim Supabase / gate RPC Stampe (CI certificata)

Codice: `a0b2480ab556492b77f4748428dc6686d838362f`. GitHub Actions `37781154980`: **SUCCESS Windows + Ubuntu**, build Vite PASS. Su entrambe le piattaforme: `test:stampe` **93/93**, `test:bank` **11/11**, `test:core` **661/661**, `test:all` **1036/1036**. Suite import 231/231, manuale 414/414, consultazione 38/38, IVA 148/148, split 25/25, ritenute 27/27.

Il consolidamento resta **NON FREEZE / NON PRONTO** nonostante la CI verde: il nuovo gate al service è solo difesa in profondità. Le funzioni SQL SECURITY DEFINER e il reale checksum server/snapshot non sono state verificate sul database. Supabase connesso; unico progetto nominativamente FiscoSim rilevato `Fiscosim v4p`, INACTIVE e senza branch; timeout su tabelle/migrazioni. Nessuna modifica DB, nessuna riattivazione o applicazione migration. L'utente deve scegliere/confermare un ambiente di test isolato e accessibile prima del collaudo SQL/E2E.
