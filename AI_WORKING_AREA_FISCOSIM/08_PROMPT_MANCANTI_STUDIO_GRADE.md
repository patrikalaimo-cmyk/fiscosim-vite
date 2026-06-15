# PROMPT MANCANTI STUDIO-GRADE FISCOSIM

Questo file tiene traccia dei prompt di sviluppo previsti per completare la transizione di FiscoSim a gestionale **Studio-Grade**.

## 1. Checkpoint Chiusi (Fase 1)
* **Commit `c3d3e3a`**: Fix autenticazione Supabase Auth e isolamento multi-tenant RLS.
* **Commit `6dd7608`**: Correzione visual encoding UI liquidazione IVA.
* **Commit `4387bb3`**: Liquidazione IVA definitiva Fase 1 (Schema & Dominio).


## Stima ufficiale residua aggiornata

La lista dei macroblocchi riportata sotto non rappresenta 15 prompt effettivi, ma 15 macroblocchi strategici di sviluppo.

La stima ufficiale residua, coerente con la valutazione del 09/06/2026, è:

- **Versione interna avanzata / studio-grade usabile bene**: 18–26 prompt compatti.
- **Versione studio-grade solida per uso reale continuativo**: 32–45 prompt compatti.
- **Versione quasi vendibile / prodotto rifinito**: 48–65 prompt compatti.

La fascia da usare come riferimento operativo principale per FiscoSim è **32–45 prompt compatti residui**, salvo extra di stabilizzazione, bug, regressioni, test manuali imprevisti o correzioni su ambiente/Supabase.

I prompt devono restare compatti ma corposi: un prompt deve chiudere un blocco funzionale ragionato, non un microfix, salvo interventi di stabilizzazione.

---

## 2. Roadmap Macroblocchi Operativi

### A. Liquidazione IVA Definitiva (Fase 2-3)
* **Macroblocco 1**: *Fase 2 Repository & RPC*. Creazione della funzione database RPC `consolida_periodo_iva_transazionale` e metodi in `contabilitaRepo.js`. (Modello: *GPT-5 / Auto*)
* **Macroblocco 2**: *Fase 3 UI React*. Modifica di `TaxComplianceView.jsx` per esibire il badge di stato consolidato, i campi storici e bloccare le azioni. (Modello: *Medium*)
* **Macroblocco 3**: *Fase 4 Riapertura e Audit*. Implementazione del flusso di riapertura periodi con motivazione obbligatoria per Owner. (Modello: *Medium*)

### B. Registri IVA e Stampe Fiscali
* **Macroblocco 4**: *Generazione PDF Registri*. Implementazione del servizio di stampa conforme per registri IVA acquisti/vendite/corrispettivi. (Modello: *Medium*)
* **Macroblocco 5**: *Marca Temporale e Blocco*. Meccanismo di numerazione progressiva e chiusura definitiva dei registri. (Modello: *Medium*)

### C. LIPE ed F24
* **Macroblocco 6**: *Base dati LIPE*. Aggregatore per estrarre i dati conformi al tracciato XML LIPE. (Modello: *GPT-5 / Auto*)
* **Macroblocco 7**: *Export XML LIPE*. Generazione del file XML per l'Agenzia delle Entrate. (Modello: *Medium*)
* **Macroblocco 8**: *Generazione F24*. Creazione automatica del modello F24 associato al debito risultante della liquidazione o delle ritenute. (Modello: *GPT-5 / Auto*)

### D. Casi IVA Avanzati in Prima Nota
* **Macroblocco 9**: *Reverse Charge & Autofatture*. Gestione integrata a causali per acquisti UE ed extra-UE (TD17/TD18/TD19). (Modello: *GPT-5 / Auto*)
* **Macroblocco 10**: *Note Credito Edge*. Gestione delle note di credito con split payment o indetraibilità parziale. (Modello: *Medium*)

### E. Import Contabilità & Riconciliazione
* **Macroblocco 11**: *Pipeline Import*. Riconfigurazione dell'import fatture elettroniche XML per generare scritture di prima nota tramite causali. (Modello: *GPT-5 / Auto*)
* **Macroblocco 12**: *Riconciliazione bancaria*. Match automatico tra movimenti bancari e partite aperte del partitario. (Modello: *GPT-5 / Auto*)

### F. Bilancio, Mastrini e Chiusure
* **Macroblocco 13**: *Mastrini & Bilancio avanzato*. Visualizzazione schede conto dettagliate e bilancio di verifica a sezioni contrapposte. (Modello: *Medium*)
* **Macroblocco 14**: *Rettifiche di fine anno*. Ratei, risconti, ammortamenti cespiti e registrazioni automatiche di chiusura/riapertura conti. (Modello: *GPT-5 / Auto*)

### G. Cespiti
* **Macroblocco 15**: *Registro Cespiti*. Gestione anagrafica beni ammortizzabili, calcolo quote e generazione automatica scritture di ammortamento. (Modello: *GPT-5 / Auto*)

---

## 3. Registro Operativo Prompt

| N. | Data | Macrofase | Tipo | Descrizione Prompt | Esito | Commit | Note |
|---|---|---|---|---|---|---|---|
| 1 | 12/06/2026 | Liquidazione IVA | Fix | Login Supabase Auth & RLS | OK | `c3d3e3a` | Incident risolto |
| 2 | 12/06/2026 | Liquidazione IVA | Fix | Visual encoding UI | OK | `6dd7608` | Mojibake risolti |
| 3 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F1 | OK | `4387bb3` | Schema & Dominio |
| 4 | 12/06/2026 | Working Area | Audit | AI Working Area + Audit | OK | - | Setup iniziale working area AI |
| 5 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2A | OK | - | RPC transazionale, patch guards, repo/client e test |
| 6 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2B | OK | `5da6dad` | Orchestratore applicativo, client facade e test |
| 7 | 13/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2C | OK | - | UI controllata con anteprima e blocco in TaxComplianceView.jsx |
| 8 | 13/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2D | OK | - | Preparazione manuale migration RPC e test manuali |
