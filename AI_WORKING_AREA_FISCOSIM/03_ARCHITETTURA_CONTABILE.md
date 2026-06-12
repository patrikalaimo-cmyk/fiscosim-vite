# ARCHITETTURA CONTABILE FISCOSIM

FiscoSim si basa su un'architettura a tre strati (Three-Tier) per garantire che i requisiti contabili vengano gestiti separatamente dall'interfaccia utente:

```
+-------------------------------------------------------------+
| UI (TaxComplianceView.jsx, InserimentoManualView.jsx)       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Application Services (liquidazioneIvaService.js, etc.)      |
+-------------------------------------------------------------+
                              |
        +---------------------+---------------------+
        |                                           |
        v                                           v
+--------------------------------+      +---------------------+
| Domain Logic (Pure JS helpers) |      | Data (Repo client)  |
+--------------------------------+      +---------------------+
```

## Principi Guida:
1. **Le Causali Guidano il Comportamento**:
   * I modelli di registrazione (righe Dare/Avere, IVA e partitario) sono dedotti dinamicamente dalle impostazioni della causale contabile/IVA. Non ci sono euristiche basate su stringhe rigide o codici hardcoded nel flusso applicativo di produzione.

2. **Single Source of Truth**:
   * I dati storici sono salvati unicamente sul database. La persistenza locale (`localStorage`) è utilizzata per l'Archivio Contenuti o per gli stati temporanei di draft, ma per i moduli fiscali e di prima nota Supabase è l'unico punto di verità.

3. **Nessuna Logica Fiscale in JSX**:
   * L'interfaccia utente React deve limitarsi a catturare gli input dell'utente e visualizzare i calcoli elaborati. La logica matematica di bilancio, arrotondamento IVA e ripartizione delle imposte risiede unicamente nei domain helper dedicati.

4. **Integrità Transazionale**:
   * Qualsiasi salvataggio definitivo che impatti più tabelle (es. testata prima nota, righe contabili, registri IVA, partitario) deve avvenire in modo atomico. Nelle fasi definitive, questo viene delegato a funzioni PostgreSQL memorizzate (RPC) per garantire l'integrità ACID in caso di disconnessioni di rete.
