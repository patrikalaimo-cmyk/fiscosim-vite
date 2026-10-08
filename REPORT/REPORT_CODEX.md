

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
