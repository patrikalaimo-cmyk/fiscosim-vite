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
