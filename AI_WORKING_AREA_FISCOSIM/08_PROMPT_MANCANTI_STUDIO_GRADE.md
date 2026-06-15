# PROMPT MANCANTI STUDIO-GRADE FISCOSIM

Questo file tiene traccia dei prompt di sviluppo previsti per completare la transizione di FiscoSim a gestionale **Studio-Grade** (uso interno per studi di commercialisti), integrando le decisioni dell'utente su F24, Ritenute, Cespiti, Estero/Reverse, Chiusure e gli audit di Import e Riconciliazione.

## 1. Checkpoint Chiusi (Fase 1-2)
* **Commit `c3d3e3a`**: Fix autenticazione Supabase Auth e isolamento multi-tenant RLS.
* **Commit `6dd7608`**: Correzione visual encoding UI liquidazione IVA.
* **Commit `4387bb3`**: Liquidazione IVA definitiva Fase 1 (Schema & Dominio).
* **Commit `4de2794`**: Allineamento del consolidamento allo schema reale (`public.liquidazione_iva`).
* **Fase 12 (Chiusura storico/export/stati) (COMPLETATO ✔)**: Implementazione del blocco dei periodi definitivi, popup di conferma per le provvisorie, fallback condizionato sul `savedRecord` (solo se non ci sono dettagli reali e `options.isSaved === true`) e nota operativa per l'export consolidato.

## 2. Stima Ufficiale Residua Aggiornata

In base alle decisioni di ridimensionamento del modulo F24 (gestito esternamente su TeamSystem/Entratel) e dello scarico massivo AdE (distaccato come modulo strumentale), e inserendo il controllo ritenute da import F24, le stime dei prompt residui per lo sviluppo sono:

* **Stima interna avanzata / studio-grade completo (uso interno)**: **38–50 prompt compatti**.
* **Scenario prudente (bug, allineamenti schema DB, legacy cleanup)**: **50–60 prompt compatti**.
* *Nota*: Le stime precedenti che includevano la gestione F24 ministeriale completa e lo scarico massivo AdE come via di ingresso primaria sono state eliminate.

---

## 3. Nuova Roadmap Macroblocchi Operativi (Fasi 13-27)

L'ordine di sviluppo approvato per le fasi successive è il seguente:

### Fase 13 — Registri IVA e stampe definitive
* **Obiettivo**: Numerazione progressiva delle pagine, marca temporale di stampa e blocco formale dei registri IVA (Acquisti, Vendite, Corrispettivi).
* **Vincoli**: La stampa definitiva blocca le modifiche al periodo contabile in prima nota.

### Fase 14 — Import Contabilità: audit e riallineamento al manuale
* **Obiettivo**: Audit del modulo di importazione SDI per verificare lo stato reale. Deve diventare l'unico canale principale di ingresso per fatture e documenti, generando esclusivamente bozze/payload canonici indirizzati all'Inserimento Manuale, senza fare uso di fonti dati legacy.

### Fase 15 — Import Contabilità operativo
* **Obiettivo**: Implementazione della pipeline operativa di importazione fatture elettroniche XML basata su regole di matching e allineamento formale al contratto di prima nota.

### Fase 16 — Cespiti leggeri agganciati a Import/Manuale
* **Obiettivo**: Modulo cespiti semplificato ed operativo per uso interno.
* **Flusso**: All'atto della registrazione di un cespite in prima nota o import, si propone il messaggio: *“È stato registrato un cespite. Procedere con inserimento nel libro cespiti? [Sì] / [No] / [Ricorda dopo]”*. La scelta *“Ricorda dopo”* inserisce una notifica persistente in dashboard o nel Libro Cespiti. Uso dello storico per suggerire aliquota e durata.

### Fase 17 — Partitario + pagamenti/incassi
* **Obiettivo**: Gestione scadenze, pagamenti parziali, scadenze multi-rata, abbuoni e insoluti integrati nel contratto canonico.

### Fase 18 — Ritenute/CU/770 + controllo F24 importati
* **Obiettivo**: Allineamento delle ritenute e integrazione del **controllo ritenute basato su import F24**.
* **Logica**: FiscoSim confronta la data di pagamento della parcella, la scadenza del versamento e la ritenuta maturata con il versato dell'F24 importato (cercando il codice tributo 1040 e il mese/anno di riferimento).
* **Stati di verifica**:
  * *Verde*: tutto versato regolarmente entro la scadenza.
  * *Giallo*: differenza zero ma pagamento eseguito in ritardo (richiede verifica ravvedimento operoso).
  * *Rosso*: differenza residua ancora da versare o da ravvedere.

### Fase 19 — Riconciliazione bancaria
* **Obiettivo**: Audit del canale banca e sviluppo completo del matching automatico solo dopo aver consolidato partitario e pagamenti. Generazione di prima nota in formato canonico identico all'inserimento manuale.

### Fase 20 — Reverse/estero limato
* **Obiettivo**: Gestione dei flussi esteri riducendo il perimetro.
* **Logica**: Uso di causali contabili e policy configurate (es. A17 per servizi, FF5 per beni) senza hardcode. Doppia annotazione acquisti + vendite con IVA neutrale. Il partitario registrerà solo l'imponibile.

### Fase 21 — Note credito edge
* **Obiettivo**: Trattamento di note credito estere o particolari a segno opposto o tramite causali dedicate semplici per velocizzare il flusso.

### Fase 22 — Modifiche/annulli/storni pragmatici e sicuri
* **Obiettivo**: Workflow di cancellazione/modifica guidato e protetto da alert graduati:
  * *Leggero*: per scritture semplici Dare/Avere.
  * *Forte*: per fatture e documenti.
  * *Conferma & Riconferma*: per scritture che impattano IVA, ritenute o partitario per prevenire regressioni o rotture dei dati storici.
  * *Sicurezza*: Blocco totale di azioni destabilizzanti ed eventuale sistema di backup/ripristino per cancellazioni critiche.

### Fase 23 — Bilancio/mastrini/situazioni
* **Obiettivo**: Estrazione dei mastrini di conto e bilancio di verifica quadrato direttamente dai dati di prima nota canonica.

### Fase 24 — Scadenzario F24 clienti Entratel
* **Obiettivo**: FiscoSim non sostituisce TeamSystem per gli F24. Lo scadenzario F24 visualizza per ogni cliente le deleghe ricorrenti inviate dallo studio tramite Entratel. Lo storico evidenzia graficamente (in verde) i tributi o le colonne ricorrenti pagati nei mesi precedenti per facilitare il controllo visivo.

### Fase 25 — Stampe/export/fascicolo cliente
* **Obiettivo**: Generazione del PDF unico di fine periodo (fascicolo cliente) con i report contabili e diagnostici.

### Fase 26 — Admin/impostazioni/regole
* **Obiettivo**: Gestione dei periodi chiusi (stampe definitive).
* **Workflow**: Dopo la stampa definitiva dei registri, la riapertura del periodo è vietata in via ordinaria. È concessa solo ad Owner/Admin e richiede: motivazione obbligatoria, logging completo delle modifiche, backup preventivo con opzione di ripristino, riconferma dei periodi interessati e ristampa definitiva obbligatoria. Per le modifiche su periodi consolidati non definitivi, si mostra l'avviso di verifica dell'eventuale invio LIPE con possibili sanzioni/ravvedimenti.

### Fase 27 — Audit finale + legacy cleanup
* **Obiettivo**: Pulizia delle directory `DISUSO`, delle tabelle deprecate (es. `accounting_entries`) e test di regressione globale di fine installazione.

---

## 4. Registro Operativo Prompt

| N. | Data | Macrofase | Tipo | Descrizione Prompt | Esito | Commit | Note |
|---|---|---|---|---|---|---|---|
| 1 | 12/06/2026 | RLS & Auth | Fix | Login Supabase Auth & RLS | OK | `c3d3e3a` | Risolto crash tenant |
| 2 | 12/06/2026 | UI IVA | Fix | Visual encoding e box-drawing | OK | `6dd7608` | Encoding UTF-8 |
| 3 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F1 | OK | `4387bb3` | Schema & Dominio |
| 4 | 12/06/2026 | Audit | Audit | Setup iniziale area di lavoro AI | OK | - | Creato audit area |
| 5 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2A | OK | - | RPC consolidamento transazionale e patch guard |
| 6 | 12/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2B | OK | `5da6dad` | Orchestratore e client facade |
| 7 | 13/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2C | OK | - | UI dashboard e bottoni consolidamento |
| 8 | 13/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Definitiva F2D | OK | `4de2794` | Allineamento schema reale `liquidazione_iva` |
| 9 | 15/06/2026 | Liquidazione IVA | Dev | Liquidazione IVA Chiusura UX / Fallback / Export | OK | - | Blocco definitiva, fallback `isSaved` e warning |
