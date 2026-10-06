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
- **IMPORT-25A-FREEZE: IN CORSO**.
- Sottoblocco corrente: **IMPORT-25A-HISTORY-1 — storico IVA controparte + percentuale detrazione proposta**.
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

