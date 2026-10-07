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
