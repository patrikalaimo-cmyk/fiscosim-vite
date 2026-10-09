

## 2026-10-07 — IVA-REGISTRI-LIQUIDAZIONE / code gate verde e formalizzazione freeze

- Commit hardening dati: `e612ca03e75ae6aa11ff9b5b09686ce6cfc4826a`.
- Commit gate test: `583d7d6b4cf3e3f24ba105ba321cf49ed10a6184`.
- GitHub Actions run `37680695367`: **SUCCESS** su Ubuntu e Windows.
- Risultati: Import 231/231; Manuale 413/413; Consultazione 38/38; IVA 148/148; Core 584/584; All safe 959/959; build PASS.
- Formalizzato audit corrente in `REPORT/IVA_REGISTRI_LIQUIDAZIONE_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Stato del blocco dopo CI documentale: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco previsto: `SPLIT-SIMPLE`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato del commit documentale: **CI PENDENTE**.


## 2026-10-08 — SPLIT-SIMPLE / audit e hardening segni nota credito

- Audit avviato dal gate IVA già verde sul branch `mio-branch`.
- Confermata la catena principale split: flag controparte/documento -> draft Manuale -> conto tecnico configurato -> partitario al solo imponibile -> registro IVA con flag split -> esclusione dal debito effettivo in liquidazione.
- Individuata divergenza reale Manuale/Import: il workflow Import preservava il lato Dare/Avere della controparte, mentre `buildSplitPaymentRows` nel Manuale forzava sempre la controparte in Dare.
- Correzione applicata: la controparte split mantiene il lato contabile originario; fattura attiva resta in Dare, nota credito attiva resta in Avere.
- Aggiunta regressione specifica per nota credito attiva split, con quadratura delle righe e rimozione della riga IVA ordinaria.
- Introdotto profilo dedicato `test:split` e step CI Windows/Linux.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Riconciliazione Bancaria resta BLOCCATA.
- Stato: **CI PENDENTE**.


## 2026-10-08 — SPLIT-SIMPLE / freeze automatico verde

- Commit codice: `91d2365a2efa9a19f099bde61fc12a95a1bd162d`.
- GitHub Actions run `37695652369`: **SUCCESS** su Ubuntu e Windows.
- Profilo `test:split`: **3 file / 25 test PASS**.
- Tutti gli step CI risultano verdi: Import, Manuale, Consultazione, IVA, Split, Core, All safe, build.
- Formalizzato audit in `REPORT/SPLIT_SIMPLE_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco: `RITENUTE-SCADENZARIO`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato commit documentale: **CI PENDENTE**.


## 2026-10-08 — RITENUTE-SCADENZARIO / audit e hardening architetturale

- Verificato gate documentale SPLIT-SIMPLE: CI `37695914834` verde su Ubuntu e Windows.
- Il percorso canonico Manuale gestisce parcella, pagamento integrale, chiusura partitario, maturazione ritenuta, debito Erario, scadenza e link PN.
- Individuato bypass legacy in `TaxComplianceView.jsx`: "Nuovo pagamento" scriveva direttamente `ritenute_dacconto` e aggiornava il documento senza Prima Nota/partitario/persistenza canonica.
- Vista Ritenute resa sola lettura: scadenzario derivato esclusivamente dai pagamenti contabilizzati.
- CU/770 "pronto" richiede ora anche CF del percipiente.
- Rimossa inferenza euristica aliquota: senza dato esplicito da draft/causale/percipiente il validator blocca.
- Aggiunto `test:ritenute` e step CI Windows/Linux.
- Nessuna migration/env/auth/RLS/policy/societa reale; Bank resta BLOCCATA.
- Stato: **CI PENDENTE**.


### 2026-10-08 — RITENUTE-SCADENZARIO / triage CI aliquota

- CI `37696964818`: Import PASS; Manual falliva su 4 regressioni ritenute.
- Diagnosi: il draft puo contenere `aliquotaRitenuta = 0`; una selezione con nullish coalescing fermava la priorita prima dell'aliquota positiva configurata sul percipiente.
- Fix: priorita esplicita sul primo valore **positivo** tra draft, default causale e percipiente. Nessun fallback euristico testuale; se nessun valore positivo e configurato resta 0 e il validator blocca.
- Stato: nuova CI pendente.


## 2026-10-08 — RITENUTE-SCADENZARIO / freeze automatico verde

- Commit hardening: `56b173b05ae9b2d84f0993318ba91d382ecee642`.
- Commit fix aliquota configurata: `9fb3b04782a7dc41d8846022a69746e15e530130`.
- GitHub Actions run `37697140035`: **SUCCESS** su Ubuntu e Windows.
- Profilo `test:ritenute`: **4 file / 27 test PASS**.
- Tutti gli step CI verdi: Import, Manuale, Consultazione, IVA, Split, Ritenute, Core, All safe, build.
- Formalizzato audit in `REPORT/RITENUTE_SCADENZARIO_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Limite residuo esplicito: pagamento parziale con ritenuta non supportato; il validator lo blocca e il requisito resta aperto prima della Release A100 salvo esclusione formale.
- Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco: `STAMPE-EXPORT-FASCICOLO`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato commit documentale: **CI PENDENTE**.


## 2026-10-08 — STAMPE-EXPORT-FASCICOLO / audit iniziale e hardening di sicurezza

- Base di partenza: RITENUTE-SCADENZARIO document gate `37697581159` SUCCESS su Ubuntu e Windows.
- Audit codice: `StampeView` conserva ancora pannelli fac-simile per Partitari, Mastrini e Bilancio. Intercettata la navigazione ai tre tab per mostrare stato non operativo, senza esporre valori campione come situazioni contabili.
- Audit registri: letture principali tenant-scoped, ma arricchimento `causali_iva` e classificazione `prima_nota` non applicavano esplicitamente il filtro società. Hardening con scoping e fail-closed quando manca una relazione necessaria.
- Export potenzialmente troncato dal limite predefinito Supabase di 1000 righe: inserito blocco esplicito conservativo su libri/registri a soglia, in attesa di paginazione integrale.
- Rimossa la dicitura ingannevole "Pagina 1 di 1" dagli HTML provvisori, non compatibile con stampe multipagina.
- Aggiunto gate `test:stampe` in CI Linux/Windows e guard dedicato.
- Non è stato generato il fascicolo cliente PDF unico; non è stato implementato il bilancio/mastrino canonico né la lettura paginata oltre soglia; restano aperti.
- Ulteriore criticità documentale: il checksum di stampa definitiva oggi calcola hash di metadati/timestamp, non delle righe effettivamente stampate. Non dichiarare garanzia d'inalterabilità del contenuto finché non sarà corretto/validato.
- Stato blocco: **IN CORSO — NON FREEZE**. Nessuna migration, modifica auth/RLS/policy/env, società reale o Bank.
- CI del commit codice: **PENDENTE**.


### 2026-10-08 — Stampe / triage CI Windows

- Run `37699566213`: Ubuntu PASS completo; Windows `test:stampe` 36/37 per confronto test che usava un newline LF letterale, convertito in CRLF da checkout Windows.
- Fix confinato al test: confronto dell'ordine tra guard e dettaglio tramite regex whitespace-agnostic.
- Nessuna regola fiscale/contabile alterata. CI successiva pendente.


## 2026-10-08 — STAMPE-EXPORT-FASCICOLO / code gate verde (non freeze)

- Commit hardening: `74e5cd1748222131134b17b7d880aee2c40d694b`.
- Commit test portabilità: `a2e2a4ec258091cd22b6a0d3da887f4490b76de4`.
- GitHub Actions run `37699787767`: **SUCCESS** su Ubuntu e Windows per tutti i profili e build.
- Nuovo profilo `test:stampe`: **5 file / 37 test PASS**.
- Gate certifica solo l'hardening: niente fac-simile presentato come reale, arricchimenti per società, abort su join fallite, no export potenzialmente troncato, no contatore pagine fittizio.
- Audit in `REPORT/STAMPE_EXPORT_FASCICOLO_AUDIT.md`, matrice e debito collaudo aggiornati.
- Gap ancora aperti: PDF unico del fascicolo, Partitari/Mastrini/Bilancio canonici, paginazione grande volume, hash sul contenuto, eliminazione codice demo, QA browser/PDF.
- **STAMPE-EXPORT-FASCICOLO resta IN CORSO / NON FREEZE**. Non avanzare al blocco LOCK-PERIODO-AUDIT prima di un gate completo.
- Riconciliazione Bancaria resta BLOCCATA. Nessuna migration/env/auth/RLS/policy/società reale.
- Stato CI del commit documentale: pendente.


## 2026-10-08 — BANK-DEV / sviluppo sbloccato e primo hardening

- Autorizzazione esplicita utente: proseguire Stampe/Export in parallelo allo sviluppo della Riconciliazione Bancaria, **senza** sbloccare scritture bancarie reali o rilascio.
- HEAD audit: `c97291ebb32e618e6caac604b4cd3c6b86a8689b`, CI `37700006171` success Ubuntu+Windows.
- Audit Bank esistente: matcher, Working View, decisioni, R8 canonico e R9A dry-run/mock disponibili. Commit reale oggi fermo intenzionalmente; RPC atomica/audit idempotente ancora non implementati.
- Difetto individuato: `validateCanonicalReconciliationPayload` impostava `valid = true` nel ramo ignored anche in presenza di blocker/contesto mancante e non vietava `primaNota` nella sezione ignored.
- Fix: ignored non sana gli errori precedenti; testata PN ignored vietata. Aggiunta suite di regressione, fixture R8/R9A e guard contro abilitazione write.
- Profilo `test:bank` aggiunto al runner e alla CI Ubuntu+Windows.
- Documentata la nuova distinzione tra gate **sviluppo consentito** e gate **produzione vietata**.
- Nessuna migration, env, auth/RLS/policy, scrittura contabile live, dato reale toccato.
- Il blocco Stampe resta in corso, non freeze.
- Stato: **CI PENDENTE**.


## 2026-10-08 — BANK-DEV / gate automatico verde

- Commit `31219e6ae10ece1660dc194d6a621e4c19cb101b`; CI `37701343937`: SUCCESS Ubuntu e Windows.
- `test:bank`: 7 test PASS. Incluse fixture R8 e R9A, 16 casi ciascuna.
- Sviluppo Bank autorizzato in parallelo a Stampe, non attivazione del commit reale.

## 2026-10-08 — STAMPE / paginazione completa in implementazione

- Creato helper `fetchAllStampeRows` con pagine da 500, ID stabili e abort su errori/duplicati/risposte anomale.
- Registri IVA: paginazione di tutte le righe, join IVA e PN in batch da 100, scope società mantenuto.
- Giornale: paginazione testate e righe in batch, fail-closed su PN priva di righe.
- Test oltre 1000 righe sintetiche; aggiornati test sicurezza preesistenti.
- Mancano ancora fascicolo PDF unico, stampe canoniche di Mastrini/Bilancio/Partitari, hash contenuto e collaudo E2E. Nessun freeze dichiarato.
- Nessuna modifica env/auth/RLS, nessuna migration o scrittura su società reali. Stato CI codice: PENDENTE.


## 2026-10-08 — STAMPE / gate paginazione verde

- Commit codice `286f0fd156957cf9ea2b77b3546ac9daa17e63b6`.
- GitHub Actions run `37701699556`: **SUCCESS** su Ubuntu e Windows.
- `test:stampe`: 6 file / 44 test PASS.
- `test:bank`: 7 test PASS.
- Import, Manuale, Consultazione, IVA, Split, Ritenute, Core, All safe e build: PASS.
- Blocco di sicurezza temporaneo >1000 righe sostituito da paginazione completa e batch join con abort su incongruenze.
- **Stampe non ancora freeze**: PDF unico del fascicolo, mastrini/bilancio/partitari canonici, hash dei contenuti e QA reali restano aperti.
- **BANK-DEV sbloccato**; il commit reale rimane vietato fino a RPC atomica, audit/idempotenza, tenant scope e collaudi.
- Nessuna migration/env/auth/RLS/policy o società reale interessata.
- CI documentale: pendente.


## 2026-10-08 — BANK-DEV / identificazione sorgente e validazione commit

- Audit su `mio-branch` dal commit `312058e8b6f699cb2ea13e1fbad2849507cd43e4` (CI precedente verde).
- Identificato rischio di aggancio errato: `buildReconciliationCommitInput` usava come `sourceDocumentId` l'ID dell'estratto conto prima dell'ID movimento.
- Corretto il riferimento: priorità al `movementId` del payload bancario, così l'identità del singolo movimento non viene sostituita da quella del file.
- Rafforzato gate commit: obbligatori `movementId` e `decisionId`, verifica mismatch fra contesto e payload su società/esercizio/conto, blocker su sezione PN diversa da Dare/Avere.
- Test automatici di regressione aggiunti al profilo Bank; nessun commit contabile reale abilitato.
- Nessuna migration, modifica auth/RLS/env o scrittura su dati reali.
- Stato: **CI PENDENTE**.


## 2026-10-08 — STAMPE / neutralizzazione formule CSV

- Audit: `escapeCsv` quotava separatori e virgolette ma non impediva a Excel/LibreOffice di interpretare celle descrittive che iniziano con `=`, `+`, `-` o `@` come formule.
- Correzione in `exportStampeProvvisorie.js`: neutralizzazione con apostrofo iniziale anche in presenza di spazi/tab/caratteri invisibili, mantenendo escaping CSV RFC-style per separatori.
- Regressioni aggiunte per Registro IVA e Libro Giornale con controparti e descrizioni sintetiche ostili.
- Il fascicolo PDF unico, Bilancio/Mastrini/Partitario canonici e checksum basato sul contenuto restano aperti; **non freeze**.
- CI codice Stampe: **PENDENTE**.


## 2026-10-08 — STAMPE / base deterministica movimenti per conto

- Introduzione di `buildMovimentiPerContoModel` nel layer application Stampe, alimentato esclusivamente da testate/righe di Prima Nota canonica (senza mock nel modello).
- Controlli fail-closed su società, periodo, stati contabilizzati, identificativi duplicati, conto mancante, importi non validi e quadratura testata/righe.
- Aggregazione Dare/Avere, saldi di movimentazione per conto, movimento analitico e saldo progressivo nel periodo con unità monetaria in centesimi.
- Righe simulate, bozze, annullate e stornate escluse dal prospetto del periodo con evidenza esplicita; stato sconosciuto produce blocker.
- Questa è una **base di dominio**, non una stampa definitiva: i saldi iniziali e i movimenti di esercizi precedenti non sono ricostruiti e la UI Stampe attende ancora integrazione.
- Aggiunta suite Node dedicata nel profilo `test:stampe`, fixture sintetiche.
- Fascicolo unico e PDF definitivo ancora aperti; Bank commit reale ancora vietato.
- Stato: **CI codice PENDENTE**.


## 2026-10-08 — BANK-DEV e STAMPE / checkpoint CI finale

- Bank input `ad773a5bdf37c0afdd59ba50e6a8569042295697`: run `37737965871` **SUCCESS** Windows e Ubuntu. sourceDocumentId punta al movimento; identità e tenant del commit validate; nessun write reale abilitato.
- Stampe CSV `d0bb3ed7214a4f609a3a20b1ea9570411517f190`: run `37738239233` **SUCCESS** Windows e Ubuntu. Formula injection mitigata su campi testuali CSV Registro IVA/Giornale.
- Stampe movimenti per conto `552470928f41276bf1e169779d1f3b15e9799f6f`: run `37738561308` **SUCCESS** Windows e Ubuntu. Helper pure JS dalla PN canonica, controlli saldo, quadratura, periodo, società, conti e stati; regressioni sintetiche aggiunte a `test:stampe`.
- Aggiornati `REPORT/STAMPE_EXPORT_FASCICOLO_AUDIT.md`, roadmap A100, matrice test, debito collaudi.
- Nessun freeze A100: mancano saldi iniziali/classificazione per bilancio, UI stampa canonica, fascicolo PDF unico, hash dei contenuti, snapshot, QA browser, RPC Bank atomica/idempotente e collaudi.
- Nessuna migration, env, auth/RLS/policy, scrittura su società reali.
- Stato commit documentale: **CI PENDENTE**.


## 2026-10-08 — STAMPE / saldo precedente e classificazione conto (P1 parziale)

- Audit: `buildMovimentiPerContoModel` forniva solo movimenti di periodo e progressivi, senza saldi precedenti né classificazione; individuato inoltre stato canonico `storno` non previsto fra le esclusioni.
- Creato `src/modules/contabilita/application/stampe/buildSaldiPerContoEsercizioModel.js`: saldo precedente da PN dal giorno iniziale esercizio al giorno prima del periodo, movimentazione del periodo, progressivo e saldo finale; classificazione e conto di dettaglio da piano conti canonico con controlli tenant, ID/codice, gerarchia, anno, date e quadratura in centesimi.
- Corretto `src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js` per escludere il movimento `storno` insieme alla scrittura `stornata`, senza alterare saldi del periodo.
- Aggiunti `tests/stampeSaldiPerContoEsercizioModel.test.js` e profilo dedicato in `scripts/run-node-tests.mjs`. Fixture esclusivamente fittizie: conto patrimoniale/economico, nota credito, Dare/Avere, saldo precedente, zero movimenti, data invalida, cambio esercizio, tenant, doppioni, gerarchia, classificazione e stati di storno.
- Guardrail: il modello non usa `piano_conti.saldo_iniziale` come riapertura verificata, non attraversa anni e non si presenta come bilancio definitivo. Mancano copertura della riapertura da anno precedente, letture complete/snapshot, UX e PDF. Il blocco Stampe resta IN CORSO / NON FREEZE.
- Sicurezza: nessuna modifica a .env, auth, RLS, migrazioni, DB live o società reali; Bank commit non abilitato. Modifiche GitHub limitate ai file del sottoblocco, working tree remoto non applicabile.
- Test/CI: PENDENTI all'apertura del commit. Prossimo intervento: saldi di riapertura da Prima Nota e verifica chiusura dell'esercizio precedente.


## 2026-10-08 — STAMPE / certificazione CI saldo precedente intraesercizio

- Commit codice+regressioni: `1ec940caf9fe70539e8a5bf80c1a8267074d0965`.
- GitHub Actions `37766190172`: **SUCCESS** Ubuntu e Windows, build produzione compresa.
- Profili su ciascuna piattaforma: `test:stampe` **61/61**, `test:bank` **11/11**, `test:core` **629/629**, `test:all` **1004/1004**; zero falliti.
- **Gate automatico del sottoblocco verde; STAMPE-EXPORT-FASCICOLO ancora NON FREEZE**. Riapertura dai precedenti esercizi, service letture complete, snapshot, UI, mastrini/bilancio definitivi, fascicolo unico e QA manuale ancora aperti.
- Nessuna scrittura su società reali, Supabase live, migration, auth/RLS o file env. Prossimo: saldi di riapertura e corrispondenza documentabile con anno precedente.

## 2026-10-08 — STAMPE / controllo chiusura-riapertura e ordinamento progressivi

- Implementato audit read-only `auditRaccordoEserciziModel` su dataset canonici (precedente esercizio intero, chiusure patrimoniali selezionate con ID, apertura corrente, piano conti e causali per ID/tipo/società). Nessuna deduzione della causale da testo e nessun utilizzo di `saldo_iniziale`.
- Controllo anno/società/stato, chiusura precedente a zero, mastri patrimoniali chiusi/riaperti a segno opposto, economici assenti nei movimenti patrimoniali; nessun effetto contabile.
- Correzione `buildSaldiPerContoEsercizioModel`: account identificato tramite `conto_id` e account via `conto_codice` ora confluiscono in unico flusso cronologico prima del calcolo del progressivo.
- Nuovi test sintetici di raccordo, fail-closed e cronologia mista; registrati in `test:stampe`.
- Esito sempre NON definitivo anche se localmente `valid`: completezza PN, closing storico, snapshot e lettura DB non certificati. Nessuna UI abilitata e nessuna migrazione, auth/RLS/env o modifica dati reali.
- CI: DA VERIFICARE dopo commit.

## Fix CI 2026-10-08 — conto per solo codice in PN storiche

La prima CI ha rilevato `anagrafica_conto_non_coerente` su più righe senza `conto_id`: il controllo del modello base confrontava `null` e stringa vuota. Corretto il confronto normalizzando valori assenti; aggiunta regressione in `stampeMovimentiPerContoModel.test.js`, oltre al test cronologico ID/codice. CI del fix da verificare; nessun nuovo freeze.

## 2026-10-08 — Raccordo / read-only loader e regressioni

- CI fix `73578a3`: run `37775668769` SUCCESS Windows e Ubuntu (stampe e baseline).
- `loadAuditRaccordoEsercizi` legge da `prima_nota`, `prima_nota_righe`, `piano_conti`, `causali_contabili` con `fetchAllStampeRows` e batch, senza filtro `attivo` nei metadati storici. Identità di chiusure/riaperture espressa da ID, no euristiche testo.
- Wrapper in repository `getAuditRaccordoEserciziPerStampa` usa `sb` soltanto in lettura. `auditRaccordoEserciziModel` continua a bloccare risultati incoerenti.
- Nuovi test query-builder mock testano processo completo (non DB reale), righe mancanti, dati >500, metadata inattivi, ID di altro tenant, errori lettura. CI PENDENTE.
- Snapshot atomico e completezza temporale non attestati; output sempre `definitive:false`, UI e PDF finale ancora non abilitati.

## 2026-10-08 — STAMPE / digest byte effettivi (non ancora definitivo)

- Loader evidence `dc282af` PASS CI `37776049729` su Windows/Ubuntu.
- Nuova utility `hashStampaContenuto` basata esclusivamente su WebCrypto SHA-256: file reale binario obbligatorio, metadati identificativi incorporati con separazione dominio, nessun fallback hash debole.
- Regressioni aggiunte per modifica byte singolo, contesto/periodo, dati invalidi, SHA non disponibile. Non modificato l'attuale flusso RPC di consolidamento, che resta NON certificato perché usa il vecchio checksum metadata-only.
- Per il gate definitivo: prima generare e verificare file esportato da snapshot coerente, poi collegare checksum e audit con verifica server-side nella stessa operazione di lock. Non eseguire ancora su società reali.
- CI PENDENTE.

## 2026-10-08 — protezione UI del consolidamento non certificato

- Hash byte effettivi `d147b43` SUCCESS Windows/Ubuntu `37776465805`.
- Individuata criticità: `StampaDefinitivaPanel` passa digest di soli metadati a `consolidazione_stampa_definitiva`, senza verifica del documento esportato; le dichiarazioni "definitiva" e "pagine" non erano supportate da prova file reale.
- Implementato `validateStampaDefinitivaEvidence`: precheck fiscale non basta; obbligatori snapshot, file archiviato, digest content SHA-256, dimensione e verifica server. In assenza (RPC attuale) la UI mostra blocker e non espone il consolidamento.
- UI non genera più checksum da timestamp/rowsCount. Vecchio helper rimane per compatibilità test storici ma non costituisce prova. Test di gate e percorso Panel aggiornati.
- Attenzione: la RPC corrente non valida la veridicità del checksum ricevuto, quindi il gate è **solo client-side**. Nessuna migration applicata né rilascio dichiarato.
- CI PENDENTE.

## 2026-10-08 — binding delle attestazioni di stampa al contesto reale

- Gating `validateStampaDefinitivaEvidence(precheck,expected)` esteso a società, tipo e periodo: nessun riuso cross-tenant/cross-period di un attestato apparentemente valido.
- `StampaDefinitivaPanel` resetta il precheck al cambio `societa?.id` e ricontrolla i campi del contesto sia dopo il precheck sia prima del consolidamento. Test puri e assert strutturali aggiunti.
- La RPC attuale non restituisce la prova di file/snapshot e resta da indurire lato server, quindi UI fail-closed. CI pendente.

## CI 2026-10-08 — aggiornamento test gating al nuovo binding

La prima CI dopo l'estensione tenant/periodo ha segnalato una sola asserzione strutturale obsoleta: cercava `validateStampaDefinitivaEvidence(data)` mentre la chiamata ora deve ricevere anche il contesto. Aggiornate entrambe le regex senza rimuovere i controlli sostanziali. CI del fix pendente.

## Gate 2026-10-08 — audit raccordo, SHA-256 contenuto e blocco definitiva non attestata

Checkpoint codice `0b04bfd3c93648e0f333b6fef9ad4da059ee68b4`. GitHub Actions `37777207489` **SUCCESS Windows e Ubuntu**, build produzione PASS. Per ciascuna piattaforma: `test:stampe` **90/90**, `test:bank` **11/11**, `test:core` **658/658**, `test:all` **1033/1033**. Non modificati database, migrations, env, auth/RLS o società reali.

La certificazione riguarda i test automatici del codice, NON lo stato funzionale A100: il consolidamento UI è volutamente bloccato senza attestazioni server, mentre la RPC esistente non prova i byte PDF e può essere invocata aggirando la UI. Rimangono obbligatori un database di test isolato e migrazione server-side approvata per snapshot, hash file, lock e audit; test browser e verifica PDF. Bank live sempre bloccata.

## 2026-10-08 — Estensione gate stampa definitiva al service e audit DB non raggiungibile

- Supabase plugin connesso, progetto con nome "Fiscosim v4p" INACTIVE e senza branch; timeout su lettura schema/migrations. Nessun accesso DB dati, alterazioni o riattivazione. Appartenenza del progetto al deployment corrente NON verificata.
- Da migrazioni versionate: `precheck_stampa_definitiva` / `consolidazione_stampa_definitiva` `SECURITY DEFINER`; non dimostrata autorizzazione auth.uid→p_societa_id, conferma p_creato_by né hash byte file. Annotati rilievi, verifiche necessarie e rischi in `REPORT/FISCOSIM_RPC_STAMPA_SERVER_SECURITY_AUDIT.md`.
- Defense-in-depth nel wrapper `motoreStampaDefinitiva.js`: prima della RPC ricontrolla precheck e attestazioni, anno/periodo/società/tipo, checksum contenuto coincidente e 64 hex; un precheck success senza prove non può più avviare il consolidamento anche bypassando il pannello.
- Nella suite fake DB le attestazioni positive sono chiaramente simulative: non fingono un server reale certificato. Test di assenza di RPC in caso di evidenza mancante, checksum divergente, società estranea e anno divergente.
- Nessuna migration applicata, nessun auth/RLS/env/DB reale o Bank commit. CI nuovo blocco pendente.

## Checkpoint 2026-10-08 — Fiscosim Supabase / gate RPC Stampe (CI certificata)

Codice: `a0b2480ab556492b77f4748428dc6686d838362f`. GitHub Actions `37781154980`: **SUCCESS Windows + Ubuntu**, build Vite PASS. Su entrambe le piattaforme: `test:stampe` **93/93**, `test:bank` **11/11**, `test:core` **661/661**, `test:all` **1036/1036**. Suite import 231/231, manuale 414/414, consultazione 38/38, IVA 148/148, split 25/25, ritenute 27/27.

Il consolidamento resta **NON FREEZE / NON PRONTO** nonostante la CI verde: il nuovo gate al service è solo difesa in profondità. Le funzioni SQL SECURITY DEFINER e il reale checksum server/snapshot non sono state verificate sul database. Supabase connesso; unico progetto nominativamente FiscoSim rilevato `Fiscosim v4p`, INACTIVE e senza branch; timeout su tabelle/migrazioni. Nessuna modifica DB, nessuna riattivazione o applicazione migration. L'utente deve scegliere/confermare un ambiente di test isolato e accessibile prima del collaudo SQL/E2E.

## 2026-10-08 — SUPABASE LIVE RIPRISTINATO: P0 SICUREZZA (read-only)

Il progetto Fiscosim v4p (endpoint coincidente con `.env.example`) è tornato `ACTIVE_HEALTHY`. Durante `COMING_UP` i cataloghi risultavano temporaneamente vuoti, poi sono riapparse **73 tabelle public, 27 funzioni, 141 policy**. `prima_nota`, `piano_conti` e `stampe_definitive` esistono. `list_migrations` resta vuoto e la relazione di tracking `supabase_migrations.schema_migrations` non risulta presente: vietata applicazione indiscriminata delle 72 migrations repository.

**P0 confermato via introspezione:** 8 funzioni `SECURITY DEFINER` eseguibili da anon; due RPC stampa owner postgres senza controlli `auth.uid`/società; **22 tabelle con policy permissiva per anon/PUBLIC e grants anon SELECT/INSERT/UPDATE/DELETE**, incluse `prima_nota_righe` e `utenti_studio`. `get_advisors(security)` senza lint ma non risolve il rischio. Non è stato tentato accesso anon via HTTP o letto dato di cliente.

Dettaglio verifiche e piano in `REPORT/FISCOSIM_SUPABASE_LIVE_SECURITY_AUDIT_20261008.md`; query riutilizzabili in `sql/audit_supabase_exposure_read_only.sql`. Stato Fiscosim **BLOCKER SICUREZZA**, freeze STAMPE e Bank live NON autorizzati. Prima di qualsiasi correzione GRANT/REVOKE/policy/RPC su database attuale occorre consenso esplicito, backup e collaudo su clone schema-only fedele con dati fittizi, valutando impatto sulle funzionalità operative.

## 2026-10-08 — P0: preparazione hardening in branch Git isolato (NON APPLICATO)

Obiettivo: contenimento degli accessi `anon` e rimozione selettiva delle policy `true` che annullano policy tenant gia presenti, senza perdere il riferimento reale. Target `mio-branch` SHA `38bfbc7`; branch di lavoro `security/p0-isolated-hardening-20261008`. Nessuna modifica a Supabase live, Vercel, segreti, auth o dati contabili.

Audit schema live in sola lettura: 73 tabelle, 27 funzioni, 141 policy; 22 tabelle con policy larga e DML anon, 8 `SECURITY DEFINER` eseguibili anon; 4 tabelle senza RLS (ai_feedback_log, ai_learning, partitari, test_scenarios). Le policy effettivamente scoped sono presenti su `prima_nota_righe`, `utenti_studio`, `causali_iva`, `causali_contabili`, `documenti_import`, `documenti_contabilita`. Queste sei possono beneficiare di rimozione mirata degli override `true`; per le altre tabelle serve un audit tenant per schema e ruolo.

Candidato SQL SOLO STAGING: `sql/security_p0/01_containment_STAGING_ONLY.sql`. Contiene transazione, precondizioni catalogo e opt-in di sessione `fiscosim.p0_isolated_approval`; revoca DML anon solo su 26 tabelle P0, revoca EXECUTE PUBLIC/anon su 8 RPC, sospende `authenticated` per tre RPC prive di guardie caller/tenant, rimuove override TRUE solo sulle sei tabelle con alternative scoped. I controlli `sql/security_p0/02_verify_READ_ONLY.sql` misurano il contenimento ma NON certificano isolation degli utenti autenticati (P0 residuale). Test statici `tests/securityP0Containment.test.js` guardano le invarianti SQL, non sostituiscono un test PostgreSQL.

Costo branch Supabase identificato: 0.01344 USD/ora, da confermare esplicitamente dall'utente prima della creazione. Nessun clone DB presente. ATTENZIONE: `supabase_migrations.schema_migrations` assente sul reale benché il repo contenga 72 files migration; non ricreare da sole migrations.
Precondizioni per live: backup/PITR verificato, test isolati auth membro/non-membro/anon, snapshot schema, verifica integrale API e UX, piano rollback e autorizzazione specifica. Nessuna modifica al database reale approvata o eseguita in questa fase.


## 2026-10-08 — P0 STAGE3G / regressione ACL rafforzata (branch isolato)
- HEAD Stage3G `4673d395` già presente su PR #2 Draft; baseline CI run `37838912768` PASS Linux/Windows. Test PostgreSQL Stage3G **NON ESEGUITO**.
- LAB ONLY: esclusa concessione DELETE diretta da `utenti_studio` (la UI disattiva logicamente), SELECT/INSERT/UPDATE limitati a colonne esplicite; postcondition conserva service_role per il provisioning server.
- TEST ONLY: prove SQL transazionali zero-row per INSERT/UPDATE `password_hash` e `auth_user_id`, DELETE e SELECT *; `ROLLBACK` obbligatorio. Verifica PostgreSQL reale pendente.
- Test statico: assert espliciti per DML vietato, visibilità segreti, service_role.
- Debito applicativo: legacy `login` browser legge password_hash quando bypass abilitato; `utenti` usa SELECT * e credenziali dal client. API `/api/auth/users` adotta Supabase Auth e service_role ma richiede audit di segregazione inter-studio prima del collegamento UI.
- Nessun merge, deploy, intervento DB live, modifica `mio-branch`, env o Docker remoto. P0 rimane aperto.


## 2026-10-08 — P0 STAGE3G / COLLLaUDO POSTGRESQL IN DOCKER ISOLATO
- L'operatore ha eseguito `24_stage3g_staff_secret_acl_LAB_ONLY.sql`, `25_stage3g_staff_secret_acl_TEST_ONLY.sql`, `23_stage3f_role_only_READ_ONLY.sql` e `04_residuals_READ_ONLY.sql` nel container `supabase_db_FiscoSim-P0-LAB-20261008-164658`, con esito finale `STAGE 3G - SQL ESEGUITO SENZA ERRORI`.
- Report `04_residuals`: `RESIDUAL_AUTH_TRUE_POLICY_TABLES=8`; tutti gli altri sette indicatori principali a zero. Il dettaglio delle notice Stage3G e l'indicatore `RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH` non sono inclusi nell'estratto trasmesso.
- **Stage3G PostgreSQL PASS come esecuzione script/test; JWT/API browser e login E2E ancora NON TESTATI**. Non ripetere il laboratorio o le Stage 1–3F.

## 2026-10-08 — P0 STAGE3H / LOGIN AUTH CLIENT SICURO
- Solo branch `security/p0-isolated-hardening-20261008`: `src/modules/login/index.jsx` rimuove il bypass con confronto password locale; usa `signInWithPassword` e `fetchSessionProfile` per profilo operativo autorizzato. Sessioni create con profilo mancante vengono disconnesse.
- `src/lib/auth.js` rimuove `isLocalAuthDisabled` e la soppressione dell'Authorization Bearer nelle chiamate API. `src/App.jsx` effettua `signOutSession` prima di azzerare lo stato UI.
- Aggiunto `tests/securityP0Stage3hAuthClient.test.js` per bloccare regressioni sul bypass e logout.
- Codice finale `0add80e7024b842328afb3921f4254d213cfce97`; GitHub Actions `37842316343`: **SUCCESS Linux e Windows**, build inclusa.
- **NON CERTIFICATO E2E**: serve ambiente locale completo Supabase Auth + API e utenti JWT reali fittizi. Il container PostgreSQL P0 non sostituisce l'intero stack applicativo.
- Residuo bloccante successivo: `src/modules/utenti/index.jsx` conserva `select('*')`, campo `password_hash` e insert/update diretti; `api/auth/users.js` usa service_role e non verifica il confine inter-studio nella selezione/mutazione dei profili. `resolveProvisionedSocietaIds` accetta societa richieste non dimostrate in scope e fallback su tutte le societa attive. **Non cablare l'UI fino a una policy server-side dimostrata con due studi indipendenti.**
- Nessun merge, deploy, modifica a `mio-branch`, `.env`, Supabase live o dati clienti. P0 rimane APERTO.


## 2026-10-08 — P0 STAGE3I / audit FK, RLS e relazioni studio (solo metadata)
- Creato `sql/security_p0/27_stage3i_studio_mapping_READ_ONLY.sql`: elenca colonne, vincoli FK, policy, ACL e definizioni delle funzioni di contesto per `utenti_studio`, `utenti_studio_societa`, `societa`, `studios`, `users`, `clients`, `clienti`, `f24_scadenze`, `f24_righe`, `liquidazioni_iva`.
- Creato `tests/securityP0Stage3iStudioMap.test.js`: assicurazione statica che il nuovo controllo non introduca DML.
- **Non applicata nessuna RLS**: i riferimenti studio/cliente e `studio_id` nullable restano da determinare tramite output del LAB. Non dedurre relazioni dal nome delle tabelle.
- Il controllo sarà eseguito esclusivamente nel Docker P0 già esistente e non interroga righe cliente. CI e verifica PostgreSQL Stage3I pendenti al commit tecnico `a9c9a7d37d502cb737eb06c2cde47b1e50c24ce7`.
- Nessun accesso write al progetto Supabase reale; `mio-branch`, .env e produzione invariati.


## 2026-10-08 — P0 STAGE3I ANALYZED / legacy studios security boundary
- L'operatore ha caricato il report `STAGE3I_RELATIONSHIP_AUDIT.txt`: `STAGE3I READ-ONLY PASS`, 370 righe, transazione terminata con `ROLLBACK`.
- Verificato: `f24_righe`, `f24_scadenze`, `liquidazioni_iva` appartengono al sottoschema legacy `studios/users/clients` (FK studio_id->studios.id; cliente_id->clients.id); hanno studio_id nullable. Nessun FK documentato che renda automaticamente equivalente `studios.id` a `societa.id` o `users.id` a `utenti_studio.id`.
- RLS: `Allow authenticated` per `studios/users/clients` e tabelle fiscali; `allow_all_*` policy TRUE per 3 tabelle; authenticated aveva SELECT/INSERT/UPDATE/DELETE a livello tabella per le sei. `user_has_societa_access` restituisce TRUE agli owner/admin senza membership target.
- BUG applicativi CONFERMATI STATICAMENTE: `src/modules/f24/index.jsx` popola clienti dalla tabella `clienti` e salva su `f24_righe` usando `client_id`, campo assente (schema contiene `cliente_id` FK verso `clients`); crea `f24_scadenze` senza studio_id. `src/modules/iva/index.jsx` invia `trimestre`, `iva_saldo`, `iva_dovuta` e ordina per `trimestre`, colonne assenti nello schema `liquidazioni_iva`; usa `clienti` anziché `clients`. L'AI agent/test_mode legacy interroga campi `societa_id` / `importo` incoerenti con le medesime tabelle.
- Nessuna correttezza funzionale F24/IVA deducibile dai PASS SQL di sicurezza; sono necessari redesign e test E2E prima dello sblocco di questi moduli.

## 2026-10-08 — P0 STAGE3J PREPARED / laboratorio-only quarantine legacy
- Predisposti `sql/security_p0/28_stage3j_legacy_quarantine_LAB_ONLY.sql`, `29_stage3j_legacy_quarantine_TEST_ONLY.sql`, `30_stage3j_rollback_TEST_ONLY.sql` e `tests/securityP0Stage3jLegacyQuarantine.test.js`.
- Patch gated/atomica: `REVOKE ALL` browser anon/authenticated/PUBLIC sulle sei tabelle `studios/users/clients/f24_scadenze/f24_righe/liquidazioni_iva`, con guard FK studio, nullable legacy e postcheck service_role + column grants; non migra dati né altera nullable/FK/policy o società principale.
- Esito deliberatamente **fail closed**: i browser user non possono più leggere/scrivere in quei sei endpoint legacy; **i vecchi moduli F24/IVA rimangono BLOCCATI** e non sono considerati funzionalmente sistemati. Server service_role deve mantenere accesso (pre/post condition).
- TEST_ONLY usa SQL a zero righe con `SET LOCAL ROLE authenticated` e ROLLBACK, senza dati fiscali. Rollback pericoloso solo con opt-in esplicito LAB.
- Stato: codice/staging preparato ma **NON APPLICATO al laboratorio Docker**, nessun test SQL reale Stage3J; CI del commit finale da verificare. Supabase reale `mlydfspmrkaedsocubku` read-only; `mio-branch`, produzione, .env e PR Draft immutati.
- Successivi P0: protezione dell'API `/api/auth/users` da modifiche tra studi, rimozione owner/admin fallback globale, altre policy TRUE/auth-only, JWT E2E; poi flusso contabile XML->staging->PN->IVA->stampe e test fiscali.


## 2026-10-08 — P0 STAGE3J LAB PASS / residui dopo quarantena
- L'operatore ha eseguito il comando Stage3J sul solo container Docker `supabase_db_FiscoSim-P0-LAB-20261008-164658`; il comando ha raggiunto la generazione di `STAGE3J_RESULT.txt`, senza errori segnalati.
- Output `23_stage3f_role_only_READ_ONLY.sql` riportato: `RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH=0`; `RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS=3`; `RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK=1`; `RISK_ROLE_ONLY_AUTHENTICATED_TABLES=3`; `RISK_TRUE_POLICY_AUTH_TABLES=5`.
- Quarantena Stage3J confermata tramite calo contatori 9→3 role-only e 8→5 true-policy visibili al browser; report completo non allegato e JWT/API E2E non testati. RLS true legacy rimane catalogata e non deve essere riabilitata con futuri GRANT.

## 2026-10-08 — P0 STAGE3K PREP / owner-admin global company fallback
- Patch candidata **SOLO LAB**: `31_stage3k_explicit_company_membership_LAB_ONLY.sql` sostituisce `user_has_societa_access(uuid)` in modalità `SECURITY INVOKER` con `EXISTS` su membership + utente attivo e uguaglianza esatta di entrambe le identità auth; rimuove ramo owner/admin `RETURN TRUE` globale.
- `32_stage3k_company_membership_TEST_ONLY.sql`: test reale RLS SQL su due società sintetiche e cinque identità (owner, admin, collaboratore, disabilitato, esterno), verifica positiva accesso società A e negativa B, lettura e aggiornamento transazionale, con ROLLBACK.
- `33_stage3k_rollback_TEST_ONLY.sql`: ripristino esplicitamente **insicuro**, LAB ONLY con GUC opt-in, mai produzione.
- `tests/securityP0Stage3kCompanyMembership.test.js`: static regressions. CI e PostgreSQL Stage3K pendenti.
- Comportamento desiderato: utenti owner/admin privi di assegnazioni esplicite non vedono i dati società; non si ricostruiscono né si inferiscono membership dai ruoli. Potenziale regressione applicativa fino a provisioning esplicito delle assegnazioni da collaudare; NON si attiva su Supabase reale.
- Permangono criticità P0 separate: altre 3 role-only table, 5 TRUE policy con grants legacy attualmente revocati, API `/api/auth/users` con service_role e scoping assente, 3 `studio_id` legacy nullable, end-to-end Auth e fiscali non eseguiti.
- Nessuna applicazione al Docker, nessuna scrittura a Supabase reale, nessun cambiamento su `mio-branch`, .env, PR o deploy.


## 2026-10-08 — P0 STAGE3K LAB PASS + residui catalogati
- Ricevuto file operatore `STAGE3K_RESULT.txt`: `STAGE3K LAB SQL PASS` su commit `a4fc89f513664fa718f9f3a929729704929491f3`; eseguiti `31_stage3k_explicit_company_membership_LAB_ONLY.sql` (`CREATE FUNCTION` + `COMMIT`) e `32_stage3k_company_membership_TEST_ONLY.sql` (fixture A/B, 5 auth users, 4 staff, 4 membership, 2 movimenti; test zero errori + `ROLLBACK`).
- Rischi Stage3F: `RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH=0`, `RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS=3`, `RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK=0`, `RISK_ROLE_ONLY_AUTHENTICATED_TABLES=3`, `RISK_TRUE_POLICY_AUTH_TABLES=5`.
- I residui ATTUALMENTE rilevanti (esposizione authenticated, non solo policy nel catalogo) sono 3 role-only: `avvisi_ade`, `client_modules`, `client_responsabili`; 5 true-policy: `invii_log`, `revisioni_dichiarativi`, `test_cases`, `test_datasets`, `test_runs`. Le policy residue legacy 3J sono ancora catalogate ma prive di grant browser.
- Conclusione: Stage3K SQL lab PASS; non ancora E2E Supabase Auth JWT/REST né cicli fiscali reali.
- Nessuna modifica al database reale, nessun merge su `mio-branch`.

## 2026-10-08 — P0 STAGE3L READ ONLY PREP
- Predisposto `sql/security_p0/34_stage3l_remaining_access_READ_ONLY.sql`: query esclusivamente dei cataloghi PostgreSQL per le otto tabelle con rischio residuo autenticato (RLS, column schema, policy, FK, grants, indici).
- Predisposto `tests/securityP0Stage3lRemainingAccess.test.js`: guardia statica su sole query catalogo e copertura di otto tabelle.
- Nessun DDL/DML, nessuna fixture, nessuna scrittura al LAB; output serve per decidere patch selettive senza rompere `avvisi_ade` e `revisioni_dichiarativi` usati dall'applicazione.
- Stage3L CI e audit SQL Docker pendenti. Nessuna azione su Supabase reale, ambiente .env, deploy, produzione o `mio-branch`.


## 2026-10-09 — P0 STAGE3L LAB PASS / eight-table residual ACL findings
- User file `STAGE3L_REMAINING_ACCESS.txt` ends with `ROLLBACK`. Confirmed metadata for eight tables, no SQL mutations.
- `avvisi_ade`: RLS on, `anon` no SELECT table grant, but authenticated has all table privileges; permissive `full_access_authenticated` policy `auth.role()='authenticated'` and residual `anon_access_test` policy (anon role true), no verified studio mapping. FK cliente_id -> `clienti`; AgeCon and import_unificato use this table.
- `revisioni_dichiarativi`: authenticated TRUE ALL policy; anon table DML grants (RLS denies anon according to role-specific policy, not equivalent to ACL denial); FK cliente_id -> `clienti`; nullable `tenant_id`/`company_id`/`owner_user_id`; review UI directly uses it.
- `client_modules`, `client_responsabili`: `auth.role()` all policy; anon/authenticated ALL grants; join to legacy `clients/users` which are already quarantined (Stage3J).
- `invii_log`: ALL TRUE policy; authenticated ALL grants; FK `invio_id` to `invii_schedulati` with ON DELETE SET NULL. No direct company ID.
- `test_cases`, `test_datasets`, `test_runs`: ALL TRUE policies; authenticated ALL privileges; no tenancy columns; `test_runs.test_case_id` FK only.
- **Not safe** to apply a generic company_id filter to avvisi/revisioni: `clienti` lacks verified company FK and revisions company_id is nullable; no invented mapping/backfill.
- Distinction: anon table grants are material attack surface but row-level policies may still deny the role. JWT/API E2E remains outstanding.

## 2026-10-09 — P0 STAGE3M PREP / segregated six-table browser quarantine
- Added `sql/security_p0/35_stage3m_six_browser_quarantine_LAB_ONLY.sql`: gated transaction removing anon/authenticated/PUBLIC browser ACL from `client_modules`, `client_responsabili`, `invii_log`, `test_cases`, `test_datasets`, `test_runs`. Verifies RLS, exact expected policies, baseline ACL, post-revocation column ACL, preserved service_role privileges.
- Added `36_stage3m_six_browser_quarantine_TEST_ONLY.sql`: SQL negative probes with `SET LOCAL ROLE authenticated` and `anon`, SELECT LIMIT 0 + INSERT/UPDATE/DELETE WHERE false, then ROLLBACK. Added `37_stage3m_rollback_TEST_ONLY.sql`: explicitly unsafe legacy grants restoration, restricted by session opt-in.
- Added `tests/securityP0Stage3mSixBrowserQuarantine.test.js`, enforce table scope and SQL guard. Candidate patch has NOT been applied to Docker; CI pending.
- `avvisi_ade` and `revisioni_dichiarativi` are deliberately **excluded** to avoid silently breaking AgeCon and review. These **remain exposed** until explicit customer/company ownership and REST auth tests. Their current policy is not safe for release.
- Stage3M does not repair unscoped legacy/test access or functional workflows; merely quarantines them. Real services for these six tables may stop serving browser calls until a verified server-scoped workflow exists. Full E2E study-grade requirement remains mandatory for every module.
- Only dedicated draft security branch affected; no write to real Supabase, no merge, deploy, .env or local Docker changes.

- Added PowerShell 5.1 runner `scripts/security_p0/run-stage3m.ps1` with pinned commit check, dedicated Docker lab selection and fail-closed result reporting. Expected after Stage3M: role-only=1, TRUE-policy reachable=1, password ACL=0, global owner fallback=0, legacy nullable=3. Stage3M is not yet executed in Docker.

 
## 2026-10-09 — P0 STAGE3M LAB PASS / Stage3N API and staff ACL
- Operatore ha allegato `STAGE3M_RESULT.txt`. PostgreSQL LAB `COMMIT` + negative tests `ROLLBACK`, status PASS; metriche residue: auth staff password hash=0; fallback owner/admin globale=0; role-only=1; true policy raggiungibili=1; nullable studio_id legacy=3.
- Stage3N API: `lib/tenantUserManagement.js` definisce filtri fail-closed sulle società del manager con profilo Auth verificato; `api/auth/users.js` GET filtra profili interamente entro l'ambito verificato e con auth_user_id congruente, POST richiede assegnazione esplicita a subset e rifiuta email già associate, PATCH/DELETE confrontano tutte le membership esistenti e il corrispondente auth_user_id prima delle operazioni privilegiate.
- Stage3N session: `lib/authMembership.js` impedisce login tramite semplice fallback email senza auth link e membership valide; rifiuta fallback membership su solo utente_id; disabilita implicit all-active company provisioning e fallback da user_metadata/ruolo globale. Il vecchio `resolveUserSocietaScope` va ripulito e testato E2E prima di rilascio.
- Code tests: `tests/securityP0Stage3nTenantUserManagement.test.js`, `tests/securityP0Stage3nAuthMembershipRuntime.test.js` con fake DB, `tests/securityP0Stage3nStaffAcl.test.js`. Sono unit/static/mock: nessuna API reale con JWT firmato verificata.
- App bypass complementare identificato: Stage3G preservava `authenticated` INSERT/UPDATE columns su `utenti_studio`, rendendo bypassabile la API `/api/auth/users`. Stage3N propone `38_stage3n_staff_write_acl_LAB_ONLY.sql` per revocare SOLO tali grants colonnari, conservare lettura specifica e `service_role`; `39_stage3n_staff_write_acl_TEST_ONLY.sql` prove SQL authenticated a zero righe con ROLLBACK; `40_stage3n_staff_write_rollback_TEST_ONLY.sql` rollback esplicitamente pericoloso con opt-in; `scripts/security_p0/run-stage3n.ps1` esecutore Windows PS5.1 e commit pin.
- Stage3N SQL non ancora applicato a Docker. Non certificare P0 globale: RLS SELECT di `utenti_studio` per owner/admin globale, policy `avvisi_ade` e `revisioni_dichiarativi`, client-scope `clienti` e mapping studio, compatibilità UI gestione utenti, JWT/API/browser E2E e cicli fiscali reali rimangono aperti.
- Nessun merge sulla PR #2 (Draft), nessuna scrittura a Supabase reale, nessun intervento su `mio-branch`, nessun deploy.


## 2026-10-09 — STAGE3N PostgreSQL LAB PASS (operatore)
- Allegato `STAGE3N_RESULT.txt`, commit `ace0a8cf235b1ad864fe982b66f3b087c7048625`.
- `38_stage3n_staff_write_acl_LAB_ONLY.sql`: `REVOKE`, `COMMIT`; `39_stage3n_staff_write_acl_TEST_ONLY.sql`: transazione `ROLLBACK`, senza errori.
- Inventario residuo `23_stage3f_role_only_READ_ONLY.sql`: `RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH=0`, `RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS=3`, `RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK=0`, `RISK_ROLE_ONLY_AUTHENTICATED_TABLES=1`, `RISK_TRUE_POLICY_AUTH_TABLES=1`.
- Questo PASS certifica il comportamento di privilegi Postgres nel laboratorio, NON l'E2E JWT/API/UI e NON la chiusura P0.

## 2026-10-09 — STAGE3O user UI -> scoped API (candidate)
- Audit statico rileva: `src/modules/utenti/index.jsx` precedente scriveva/leggeva direttamente `public.utenti_studio` e gestiva `password_hash` nel browser; comportamento incompatibile con Stage3N. Inoltre non permetteva scelta esplicita delle società, richiesta dalla nuova API `api/auth/users.js`.
- Patch solo su branch P0: ModuloUtenti usa `apiFetch('/api/auth/users')` per GET/POST/PATCH/DELETE, invia `password` attraverso Auth server invece di `password_hash`, riceve il profilo sessione da `App.jsx`, visualizza soltanto le società assegnate al responsabile, richiede almeno un'assegnazione esplicita, gestisce errori delle operazioni. Aggiunti guard statici `tests/securityP0Stage3oUserUiApi.test.js`.
- Funzione `clienti` ancora da isolare per studio: il form ha una query diretta di elenco clienti in modalità «solo assegnati»; la API server accetta `clienti_assegnati` senza verifica di appartenenza a una società, per assenza mapping autorevole `clienti` -> `societa`. **Non certificare controllo tenant completo; client permissions and AgeCon/revision remain P0 pending.**
- Nessun deploy, nessuna esecuzione nel Docker dell'interfaccia o API con JWT; nessuna scrittura a Supabase reale e nessun merge.


## 2026-10-09 — P0 STAGE3N RE-RUN FIX / STAGE3P OWNERSHIP CONTRACT
- **Provenienza:** operatore ha allegato `STAGE3N_RESULT.txt` con `STAGE3N LAB SQL PASS` (`COMMIT`, role SQL tests `ROLLBACK`, valori risk: password_hash=0, owner fallback=0, role-only reachable=1, true-policy reachable=1, legacy nullable=3). Un secondo tentativo ha dato `Stage3N unexpected Stage3G staff-ACL baseline`, **coerente con applicazione già completata**: nessuna seconda applicazione SQL né mutazione DB in quel tentativo.
- **Fix idempotenza candidato**: `sql/security_p0/38_stage3n_staff_write_acl_LAB_ONLY.sql` riconosce le coppie coerenti dei grant Stage3G (da revocare) e Stage3N già revocati. Rifiuta situazioni parziali e verifica tutte le colonne e i privilegi `service_role` prima del `COMMIT`. `REVOKE` può essere eseguito più volte senza alterare altre policy.
- **Preservazione prove**: `scripts/security_p0/run-stage3n.ps1` non sovrascrive più `STAGE3N_RESULT.txt` precedente; eventuale recheck salvato a parte, con protezione da collisioni. Aggiornato `tests/securityP0Stage3nStaffAcl.test.js`. **Questa revisione dello script non è stata eseguita nel Docker**; precedente Stage3N SQL LAB resta PASS.
- **Audit connessioni clienti**: `clienti` è anagrafica CRM senza FK o campo `societa_id`; `avvisi_ade.cliente_id` e `revisioni_dichiarativi.cliente_id` riferiscono `clienti`, non la società; `revisioni_dichiarativi.company_id` nullable non è una ownership verificata. Clienti, AgeCon, revisioni, e assegnazione `clienti_assegnati` condividono percorso browser diretto. Nessuna prova autorizza mapping per CF/PIVA/nome o per legacy `studios`.
- **Stage3P specifica candidata**: `docs/security_p0/CLIENTI_SOCIETA_OWNERSHIP_CONTRACT.md` definisce l'isolamento canonico, vincoli su record sensibili, gestione conservativa degli orfani, esclusione dei fallback e matrice TEN-01..TEN-14 da collaudare **con JWT e API effettivi**. Documento di progetto: non contiene migration né backfill.
- **Stato P0**: Stage3N privilegi Docker PASS; Stage3O frontend/API test CI sul codice sì, E2E runtime no; AgeCon/revisioni/cliente-ownership restano aperte e non sicure per rilascio, come anche scope `clienti_assegnati`/client list. Non ridurre i residui P0 tramite sole revoche che interrompano silenziosamente i flussi professionali. 
- **Perimetro rispettato**: soltanto branch `security/p0-isolated-hardening-20261008`, PR #2 Draft e non mergiata; nessun comando eseguito sul Docker dell'utente, nessun Supabase LIVE write, nessun deploy, .env immutati. CI commit finale ancora da verificare.
- **Prossimo**: definire tenancy canonica e piano di migrazione LAB (non automatica), quindi isolamento completo clienti/AgeCon/revisioni e E2E JWT multi-company; separatamente avviare test operativi reali del ciclo contabile italiano come in roadmap Studio-Grade.


## 2026-10-09 — Stage3P OWNERSHIP IMPLEMENTATION PREPARED, NOT DEPLOYED
- Read-only preflight: `sql/security_p0/41_stage3p_ownership_preflight_READ_ONLY.sql` extracts only PostgreSQL columns, FK/check constraints, policies, exposed grants, auth helper metadata and anonymized aggregate counts for clienti/societa/avvisi/revisioni; `scripts/security_p0/run-stage3p-preflight.ps1` pins exact Git SHA, checks dedicated Docker container, uses `BEGIN READ ONLY`/`ROLLBACK`, and never overwrites prior reports.
- Candidate LAB-only schema foundation: `sql/security_p0/42_stage3p_empty_crm_link_LAB_ONLY.sql` adds `public.crm_cliente_societa_link` (UUID pair PK, FKs to `clienti`, `societa`, `auth.users`, reviewer and reason obligatory), enables RLS without policies, revokes ALL anon/authenticated/PUBLIC, permits service_role SELECT/INSERT only. No row backfill, no change to existing CRM/tax tables/policies. Rerun guards recognize only empty structurally verified link.
- Negative SQL-role test `43_stage3p_empty_crm_link_TEST_ONLY.sql`: authenticated and anon DML denied even with zero-row statements, service SELECT and zero-row INSERT allowed, ROLLBACK. `tests/securityP0Stage3pCrmCompanyScope.test.js` adds static regressions.
- **NOT YET RUN:** Neither 41 in Docker nor 42/43 SQL in Docker. CI required and not a substitute for PostgreSQL tests. No claim that AgeCon/revisioni/clienti tenant isolation is closed.
- Architecture fact: `clienti` legacy compatibility bootstrap contains only `id`; functional schema in Docker may have a different set of columns, preflight required before policy changes. Existing user-can-access-cliente policies allow global owner/admin; actual P0 closure needs direct RLS ownership, not just bridge.
- Follow-up after preflight: verify active production-like table schema, design single-owner fiscal row scope on AgeCon/revisions and explicit associations for legacy records, test negative cross-company JWT/Auth/API. All fiscal E2E remain mandatory.
- No write to live Supabase, no local Docker changes from ChatGPT, no merge to `mio-branch`, PR #2 remains DRAFT.
