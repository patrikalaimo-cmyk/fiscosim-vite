# FiscoSim — Audit evidenze ciclo contabile reale (2026-10-09)

**Ambiente di lavoro:** `security/p0-isolated-hardening-20261008`, PR #2 Draft verso `mio-branch`. Questo documento NON è un certificato di rilascio.

## 1. Esito determinante

Non esiste, nelle evidenze versionate esaminate, un verbale **PASS** di ciclo contabile integrale con scritture realmente persistite su PostgreSQL e verificate in sequenza su **prima nota + registri IVA + partitario + pagamenti + liquidazione + mastrini/bilancio + chiusura/riapertura**.

- Stage3Q/R/S **PASS reale nel Docker**: verifica l'isolamento società e transazioni **CRM / AgeCon / revisione dichiarativi**, con fixture A/B in rollback. Non prova alcuna registrazione di fattura nel ciclo di prima nota.
- Stage3T **CI HTTP negativa PASS**: esistono route/API e prove 401/403/503/400/413 su Node reale; JWT firmati A/B e PostgREST locale sono ancora da provare.
- La baseline ufficiale `REPORT/FISCOSIM_TEST_MATRIX.md` dice esplicitamente che `test:all` usa `node:test` senza connessioni o scritture DB reali. I test chiamati "EndToEnd" nel nome possono simulare i layer; il nome non è prova di E2E PostgreSQL.
- Ultima CI verificata `37952121059` su HEAD `3657094a0144e50de29f05b39caa8218f88a8b41`: Ubuntu e Windows PASS; su ciascuna piattaforma **Import 231, Manuale 414, Consultazione 38, IVA 148, Split 25, Ritenute 27, Stampe 93, Bank 11, Core 775, All safe 1150**; build PASS. I profili si sovrappongono: non sommare queste cifre per un totale di casi distinti.

## 2. Mappa livello di prova

| Area | Implementazione/evidenza automatica | PostgreSQL end-to-end con dati sintetici persistiti | Ultimo blocker noto |
|---|---|---|---|
| Registrazione manuale / PN generale | Avanzata, test canonici salvataggio e quadratura, 414 test del profilo manuale | **NON ATTESTATO** | commit PN completa ACID server-side ancora descritto come parzialmente client-side / rollback best-effort; test sessione e persistenza |
| Consultazione PN | Filtri, stati, progressivi, export, guard no-write (38 test) | **NON ATTESTATO** | browser/dataset persistiti, drilldown e confronto con PN sottostante |
| Import Contabilità XML/ZIP | Parser, draft, causali standard/storico, prunatura IVA 0/0, dedup, 231 test | **NON ATTESTATO** | file-picker XML/ZIP, commit controllato, UUID staging, nessun doppio invio, confronto Import=Manuale |
| IVA ordinaria / multi-aliquota / NC | Registri, modello liquidazione, 148 test | **NON ATTESTATO** | vere scritture PN→registri_iva→aggregazione→liquidazione; verifica data e importi |
| Split payment | 25 test, incluso segno NC e partitario al solo imponibile | **NON ATTESTATO** | end-to-end fattura e NC, conto tecnico e liquidazione reale |
| IVA per cassa | Calcolo documento/incasso e rilascio testati in Node | **NON ATTESTATO** | incassi parziali persistiti, partitario, quota liquidata nel mese corretto |
| Reverse/UE/extra UE | Causali e movimenti simulati nei test Manuale | **NON ATTESTATO** | registrazioni reciproche IVA, imponibile partitario e neutralità coerente |
| Ritenute CU/770 | 27 test: parcella, pagamento integrale, Erario 1040, scadenziario, guard | **NON ATTESTATO** | pagamento parziale con ritenuta è esplicitamente NON supportato; verifica F24 importato pendente |
| Riconciliazione Bancaria | Matcher e payload canonici R8/R9A, dry-run e 11 test | **NON ATTESTATO** | commit reale volutamente disabilitato; mancano RPC atomica, audit, idempotenza, E2E |
| Stampe, mastrini e bilancio | Modelli read-only su PN, saldi intraesercizio, raccordo teorico, 93 test | **NON ATTESTATO** | saldi d'apertura/chiusure verificati, snapshot affidabile, UI bilancio/mastri/partitari, PDF fascicolo |
| Registri e stampe definitive | Modelli e hash WebCrypto, gate UI/service per non attestare false definitività | **NON ATTESTATO** | RPC SECURITY DEFINER, lock e checksum byte file server/snapshot non certificati |
| Chiusura/riapertura esercizio | Audit teorico raccordo esercizi/read-only | **NON ATTESTATO** | chiusure e riaperture vere, assestamenti, riporto saldi, ristampa controllata, backup/log |
| Clienti / AgeCon / revisioni dichiarativi | Stage3Q/R/S transazioni A/B PostgreSQL realmente provate in LAB | **PASS solo nel loro perimetro** | JWT firmato, UI e test dati reali non vuoti |

**Nota fonti:** `REPORT/FISCOSIM_TEST_MATRIX.md`, `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`, `REPORT/REPORT_CODEX.md` (sezioni 2026-10-07/09), `REPORT/STAMPE_EXPORT_FASCICOLO_AUDIT.md`, `REPORT/IVA_REGISTRI_LIQUIDAZIONE_FREEZE_AUDIT.md` e roadmap ufficiale `ROADMAP_FISCOSIM_STUDIO_GRADE.md`. I documenti più vecchi che chiamano un sottoblocco "Studio Grade completo" vanno letti come **stato di sviluppo/CI di quella fase**, non come certificazione end-to-end dell'intero ciclo.

## 2a. Rischio P0 contabile verificato direttamente nel codice (non mera ipotesi)

`src/modules/contabilita/application/persistPrimaNotaDraft.js` chiama `createPrimaNotaCompleta` per salvare dati contabili. L'implementazione in `services/primaNotaService.js` attuale esegue **richieste DB distinte**:
1. INSERT testata `prima_nota` (circa linea 105).
2. INSERT righe `prima_nota_righe` (circa linea 127).
3. INSERT `registri_iva` (circa linea 140).
4. INSERT/apertura `partitario` e UPDATE di partite esistenti (circa linee 164, 182, 305).
5. INSERT e UPDATE delle `ritenute_dacconto` (circa linee 205, 223).

Il fallback `cleanupPrimaNotaCompleta` (circa linee 74–88) prova a cancellare per `prima_nota_id` le righe create e la testata, sopprimendo errori durante il cleanup. **Non rappresenta una transazione ACID unica**; il cleanup non riporta automaticamente allo stato precedente le UPDATE già eseguite su partite o ritenute precedenti. Inoltre, un guasto di rete può rendere dubbio l'esito del commit e una ritrasmissione può duplicare effetti senza idempotenza server.

**Gate contabile ZERO prima della certificazione:** creare e collaudare una RPC server-side **single-transaction** per il salvataggio canonico PN con dettagli IVA/partitario/ritenute, snapshot/audit, controllo società/Auth, anti-duplicazione e test di errore in ciascuna fase. Non riutilizzare la RPC CRM Stage3R come se coprisse la PN. Nessuna nuova scrittura reale di contabilizzazione è autorizzata finché non sia possibile provare rollback completo in laboratorio.

## 3. Ordine obbligatorio per il prossimo ciclo E2E reale

Eseguire **solo su un laboratorio isolato senza dati clienti reali**. Nessun test deve impostare automaticamente `PASS` in assenza di prova leggibile su database. Un intervento non richiesto nel Supabase LIVE è vietato.

**GATE 0 — Preflight catalogo:** `53_accounting_cycle_inventory_READ_ONLY.sql` legge in sola transazione `READ ONLY` presenza di tabelle, colonne e funzioni. È solo un inventario di fattibilità; **non** è un ciclo contabile. Agganciare il catalogo al laboratorio Docker P0 senza alterarne la configurazione. Mancanze vanno analizzate prima di creare fixture.

**GATE 1 — Scenario base PN registrata:** società A + B, un esercizio, piano conti coerente, causali e controparti fittizie; scrittura 100 Dare/100 Avere su flusso server autenticato. Verificare testata e righe su DB, identità/evidenza audit, effettivo bilanciamento a centesimo; blocco 100 Dare/99,99 Avere; rollback su fallimento e impossibilità di cross-company.

**GATE 2 — Fatture e IVA:** fatture vendita e acquisto 22%, multi-aliquota 22/10%, nota credito con segni, righe 0/0 prive di natura escluse, aliquota/natura e causale IVA da priorità standard→storico→AI (con warning discrepanza). Ogni documento una sola PN, registri IVA una sola volta, nessuna doppia contabilizzazione.

**GATE 3 — Partite/incassi/pagamenti:** verifica nascita partita e chiusura a saldo; pagamenti parziali/residui; IVA per cassa quota esigibile e rilascio, split payment cliente al solo imponibile; riconciliare PN/partitario/IVA. Scenario pagamento parziale con ritenuta deve essere esplicitamente segnato `BLOCKED_UNSUPPORTED` e non simulare esito positivo.

**GATE 4 — Scadenze e ritenute:** parcella, pagamento integrale, debito 1040, scadenza, CU/770 readiness, controllo con F24 importato con esiti zero/in ritardo/scoperto, quando l'import F24 è operativo.

**GATE 5 — Liquidazione/registri:** aggregazione verificata dai movimenti del periodo, debito/credito IVA, split escluso dal debito effettivo, IVA per cassa ai cash event, registro e libro giornale con totale ricostruibile, tentativo doppio consolidamento e periodo chiuso negati.

**GATE 6 — Mastrini e bilancio:** rilettura esaustiva PN per conto, saldo iniziale dall'esercizio precedente verificato, Dare=Avere totale, conto economico/patrimoniale, mastrino coerente con giornale e situazioni. Assestamenti ratei/risconti/ammortamenti se supportati; altrimenti `NOT_IMPLEMENTED`, mai PASS.

**GATE 7 — Chiusura e riapertura:** chiusure conti economici, patrimoniali, utile/perdita, riapertura esercizio successivo, continuità saldi per conto, lock/ruoli/autorizzazioni/backup, audit, esportazione immutabile e fascicolo; dove manca RPC definitiva/byte-checksum `BLOCKED`.

**GATE 8 — Bank:** confrontare movimento estratto conto con partitario, proposta e idempotenza; solo dopo RPC/sicurezza e collaudo, autorizzare commit reale in LAB.

## 4. Evidenze richieste per ogni gate

- Commit immutabile; versione/schema database del LAB; identificativi società e documenti **sintetici**; JWT realmente verificati quando il test usa API; percorso preciso servizio di import/manuale/banca.
- Valori attesi e riscontrati con centesimi, saldo del partitario, righe e tipologia registro IVA, idempotenza, audit, user/tenant, periodo contabile.
- Query SELECT post-salvataggio + hash/snapshot dell'output quando richiesto; esito SQL/HTTP/browser; rollback o cleanup transazionale dei dati fixture documentato.
- Stati validi: `PASS`, `FAIL`, `BLOCKED`, `NOT_IMPLEMENTED`, `NOT_EXECUTED`. Non usare percentuali globali prima del completamento della matrice.

## 5. Stato ufficiale dei gate al 9/10/2026

- **POSTGRESQL SECURITY 3Q/R/S:** `PASS (ISOLATED LAB)`.
- **AUTH SIGNED JWT + HTTP A/B:** `NOT_EXECUTED`; harness separato Stage3T predisposto.
- **CICLO CONTABILE GATE 0–8:** `NOT_EXECUTED / BLOCKED` secondo la disponibilità delle funzionalità. Non promuovere i PASS Node di codice a collaudo PostgreSQL.
- **STAMPE-EXPORT-FASCICOLO:** `NOT_FREEZE`.
- **BANK REAL COMMIT:** `BLOCKED`.
- **RILASCIO A100:** `BLOCKED`.

**Decisione operativa:** non iniziare da chiusura/bilancio o banca, che dipendono da transazioni precedenti ancora non certificate. Prima eseguire il GATE 0 e preparare un ambiente Auth+PostgREST/fixture completamente isolato. Solo dopo, GATE 1→2→3→5, quindi gli altri, senza salti di contabilità.


## 6. Stage3U — candidato movimento PN generale atomico (NON ESEGUITO IN POSTGRESQL)

- `sql/security_p0/54_stage3u_general_journal_atomic_LAB_ONLY.sql` definisce **solo in laboratorio** una RPC `fiscosim_post_general_journal` `SECURITY INVOKER`, eseguibile soltanto da `service_role`, che verifica profilo Auth, membership owner/admin della specifica società e conto appartenente a quella società. Le righe ammesse sono esclusivamente contabili (conto, Dare, Avere, descrizione) senza IVA/partitario/ritenute; quadratura al centesimo obbligatoria.
- La procedura inserisce in un'unica transazione PostgreSQL **claim idempotente, testata PN, righe PN e audit**; un secondo invio identico restituisce lo stesso UUID PN, un invio divergente con la stessa chiave viene rifiutato. Nessuna correzione tramite cancellazioni best-effort.
- `api/studio/general-journal-post.js` rende il contratto disponibile **solo** quando `FISCOSIM_ISOLATED_LAB_API=true`, `FISCOSIM_GENERAL_JOURNAL_POST_LAB_ENABLED=true`, URL Supabase su loopback e sessione Auth verificata. Non è connesso a `persistPrimaNotaDraft` né alla UI, così fatture e pagamenti non vengono indirizzati erroneamente a un percorso senza effetti fiscali.
- `sql/security_p0/55_stage3u_general_journal_matrix_TEST_ONLY.sql` è una matrice candidata su PostgreSQL reale: società A/B, conto estraneo, squadratura, replay, cambio payload, verifica una sola testata/due righe/un audit e **errore forzato in INSERT audit dopo le prime scritture**, con controllo assenza di residui. La matrice fa `ROLLBACK` e non è un JWT E2E.
- `sql/security_p0/56_stage3u_accounting_preflight_READ_ONLY.sql` più `scripts/security_p0/run-stage3u-accounting-preflight.ps1`: esame dello schema/prerequisiti su Docker P0 con SHA vincolato e report conservato; esegue soltanto `BEGIN READ ONLY` / `ROLLBACK`. Non è stato eseguito; non avvia la migrazione.
- Stato effettivo **Stage3U PREPARED / Node CI da verificare / POSTGRESQL NOT EXECUTED / JWT NOT EXECUTED / UI NOT CONNECTED**. In particolare nessuna evidenza autorizza a trattare l'intero `createPrimaNotaCompleta` come atomico: i flussi IVA, partitario, pagamenti, ritenute, import, periodi chiusi e progressivi richiedono ancora la propria RPC unica e la verifica reale. Il percorso Stage3U è sperimentale e **inaccessibile in produzione**.
- Ordine prossimo: audit read-only del Docker 56; compatibilità schema+grants; solo poi collaudo 54+55, verifica effettiva atomicità generale; in seguito progettazione e collaudo dei payload fiscali canonici più complessi senza rompere il workflow attuale.


## 7. Evidenza Stage3U del 09/10/2026: prova SQL atomica generale PASS in ROLLBACK

**Stato aggiornato rispetto alle annotazioni preliminari della sezione 6.** Il file effettivamente prodotto dal Docker `STAGE3U_REHEARSAL_20261009-225419-200.txt` attesta sul commit immutabile `65f9b6738a2e0be8ac4d677289f3544a3bb10805`:

- `Stage3U general journal balance / owner / idempotency matrix PASS`: una registrazione generale quadrata, controlli sull'assegnazione società/conti, idempotenza e rifiuto replay modificato
- `Stage3U late failure rollback PASS`: fallimento forzato nell'audit dopo aver iniziato la registrazione, senza righe residue della transazione fallita
- `STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK`: esecuzione reale della matrice SQL con ruoli simulati, non MockDb
- `STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED`: verificato dopo `ROLLBACK` che né schema Stage3U né scritture contabili sintetiche rimangono installati/salvati

**Conclusione esatta:** `GATE 1 / movimento generale atomico: POSTGRESQL TRANSACTIONAL REHEARSAL PASS (rollback)`, ma `GATE 1 / HTTP con JWT e salvataggio persistente: NOT_EXECUTED`; `GATE 1 / fattura con IVA/partita/ritenuta: NOT_CERTIFIED`. Nessuna validazione dell'intero ciclo 0–8 e nessuna certificazione contabile A100. PostgreSQL `nextval` può avanzare anche se la rehearsal termina con `ROLLBACK`.

Prossima attività **senza ripetere la rehearsal**: installazione persistente LAB Stage3U soggetta ad approvazione esplicita, prova con JWT reale API e successivo sviluppo di transazione canonica completa (IVA, partite, ritenute, import, chiusure). `mio-branch` e Supabase LIVE invariati.


## 8. Stato Stage3U persistente e Stage3V JWT (evidenza 09/10/2026 23:26)

**Conferma reale ricevuta:** `STAGE3U_PERSISTENT_LAB_INSTALL_20261009-232611-790.txt` sul commit `1434acf59bc53449b81b2411dbfeaaffa24b26d6` e container isolato `supabase_db_FiscoSim-P0-LAB-20261008-164658`.

- `STAGE3U_PERSISTENT_LAB_INSTALL_PASS` con migrazione 54 `COMMIT` e tabella claim, RLS/ACL, RPC `fiscosim_post_general_journal` **effettivamente persistenti nel Docker**. Matrice SQL 55 PASS con replay idempotente, divisione A/B, quadratura e failure injection tardiva su audit. Fixture test in `ROLLBACK`.
- `3U_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS` certifica **nessuna registrazione campione permanente**; l'installazione strutturale rimane. Le annotazioni precedenti relative alla sola rehearsal o all'installazione ancora pendente sono storiche e non rappresentano lo stato attuale.
- `REAL_JWT_E2E=false` nel report. È scorretto indicare come superati API/HTTP con sessioni reali, registrazioni persistite e confronti contabili da browser.

**Stage3V codice aggiunto (non eseguito):** `scripts/security_p0/stage3v-signed-jwt-general-journal-e2e.mjs`, con gate localhost su Supabase Auth/Rest e API, account A e B distinti verificati da Auth, società reali del LAB con codice `STAGE3V-`, piano conti attivo e appartenente alla società, negazione accesso anonimo/token alterato/cross-company, rifiuto squadrature. Il test positivo è opt-in mediante `FISCOSIM_STAGE3V_PERSISTENT_WRITE_APPROVAL=LAB_SYNTHETIC_WRITE_APPROVED`. Se esplicitamente autorizzato, pubblica una PN generale per società A e B, confronta l'UUID al replay, nega il riuso della stessa chiave con importo diverso e rilegge testata, righe, audit e claim persistiti via PostgREST local con service role. Non cancella silenziosamente il risultato: fixture e cleanup devono essere gestiti esplicitamente. Nessun token o password viene stampato.

**Prerequisiti non ancora attestati:** Auth GoTrue locale collegato **allo stesso** database Stage3U (non solo al singolo container PostgreSQL), gateway PostgREST locale e chiavi LAB valide, due identità emesse da Auth e due società sintetiche `STAGE3V-` con 2 conti ciascuna; ogni assenza deve dare `BLOCKED`, non `PASS`. Test Node di guardia del harness non equivale a E2E firmato. Nessun nuovo comando necessario finché non esistono i prerequisiti.

**Perimetro invariato:** test Stage3U generale non convalida IVA/partitario/ritenute/import/chiusura annua. L'attuale `createPrimaNotaCompleta` salva più tabelle con rollback best-effort; deve essere sostituito da transazione completa quando pronta, senza adesso reindirizzare le UI fiscali alla RPC generale.
