# ROADMAP ATTIVA — SVILUPPO LIQUIDAZIONE IVA DEFINITIVA

L'attività corrente si concentra sul completamento del modulo **Liquidazione IVA Definitiva Studio-Grade**.

## Stato dei Lavori

```
+------------------------------------------------------------+
| FASE 1: Schema DB e Dominio Service (COMPLETATO ✔)         |
+------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------+
| FASE 2: Repository, RPC PostgreSQL e Chiusura Periodo (IN CORSO ⏳) |
+------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------+
| FASE 3: Interfaccia Utente React e Storico Chiusure        |
+------------------------------------------------------------+
```

## Dettaglio dei Prossimi Step (Fase 2)

1. **Implementazione Query Repository (COMPLETATO ✔)**:
   * Scritte le funzioni in `contabilitaRepo.js` per interrogare lo stato della liquidazione consolidata (`liquidazione_iva` con campo `stato = 'definitiva'`).
   * Adattato `isIvaPeriodLiquidated` affinché legga dalla tabella canonica `liquidazione_iva` al posto di `liquidazioni_iva_societa`.

2. **Creazione Procedura Memorizzata (RPC Supabase) (COMPLETATO ✔)**:
   * Sviluppata la funzione database `consolida_periodo_iva_transazionale` che inserisce l'header della liquidazione in stato `'definitiva'` e copia le righe dei registri IVA in `liquidazioni_iva_righe` in modo transazionale e ACID.

3. **Integrazione del Blocco di Sicurezza (COMPLETATO ✔)**:
   * Patchata la funzione `rpc_get_prima_nota_operation_guards` per considerare solo liquidazioni in stato `'definitiva'`.
   * Scritti i relativi test unitari con mock Supabase per verificare il comportamento e le esclusioni in `tests/liquidazioneIvaDefinitivaRpcClient.test.js`.

4. **Orchestrazione Applicativa (COMPLETATO ✔)**:
   * Creato `liquidazioneIvaDefinitivaOrchestrator.js` per preparare il payload completo di snapshot e delegare il salvataggio atomico.
   * Esportate le funzioni dal client API contabile per uniformare l'interfaccia.
   * Suite di test in `tests/liquidazioneIvaDefinitivaOrchestrator.test.js` creata con successo.

5. **Integrazione UI React (PROSSIMO STEP ⏳)**:
   * Modifica di `TaxComplianceView.jsx` per esibire il badge di stato consolidato, i campi storici e bloccare le azioni.
