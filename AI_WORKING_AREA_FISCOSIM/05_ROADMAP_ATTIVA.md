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

1. **Implementazione Query Repository**:
   * Scrivere le funzioni in `contabilitaRepo.js` per interrogare lo stato della liquidazione consolidata (`liquidazione_iva` con campo `stato = 'definitiva'`).
   * Adattare `isIvaPeriodLiquidated` affinché legga dalla tabella canonica `liquidazione_iva` al posto di `liquidazioni_iva_societa`.

2. **Creazione Procedura Memorizzata (RPC Supabase)**:
   * Sviluppare la funzione database `consolida_periodo_iva_transazionale` che inserisce l'header della liquidazione in stato `'definitiva'` e copia le righe dei registri IVA in `liquidazioni_iva_righe` in modo transazionale e ACID.

3. **Integrazione del Blocco di Sicurezza**:
   * Blindare i controlli affinché qualsiasi inserimento, modifica o cancellazione di prima nota che tocchi `registri_iva` venga respinto se la data ricade in un periodo consolidato.
   * Scrivere i relativi test di integrazione.
