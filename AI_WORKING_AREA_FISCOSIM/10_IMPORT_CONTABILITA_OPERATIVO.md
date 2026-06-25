# IMPORT CONTABILITÀ OPERATIVO — HARDENING CASI FISCALI COMPLESSI

Questo documento descrive il consolidamento dell'Import Contabilità per la gestione dei casi fiscali complessi prima del passaggio al motore di Riconciliazione Bancaria.

## Casi Fiscali Consolidati in Fase 15

### 1. Ritenute d'acconto (Parcelle Professionisti)
* **Funzionamento**: In presenza di ritenuta (rilevata da flag o da tag `DatiRitenuta` XML), il commit workflow dell'import compila correttamente `ritenutaDraft` popolando il record del percipiente (`percipienteRecord`) e le righe della ritenuta con compenso, base, aliquota, importo ritenuta e netto a pagare.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `gestioneRitenute`), `persistPrimaNotaDraft` (inserimento `ritenute_dacconto`).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con ritenuta d acconto percipiente` in `importContabilitaHardening.test.js`.

### 2. Split Payment (Scissione dei pagamenti)
* **Funzionamento**: Attivato in anagrafica cliente (soggetto pubblico/PA). Il commit workflow esclude la riga IVA dall'inserimento in prima nota righe, riduce il debito/credito v/cliente al solo imponibile e inserisce la riga del partitario sul solo imponibile.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `splitPayment`), `persistPrimaNotaDraft`.
* **Gap documentato**: risoluzione riga IVA da omettere usa codici parzialmente hardcoded (`1.03.01.001`, `2.04.01.001`) — da estrarre in helper condiviso per supporto piani dei conti personalizzati.
* **Test di riferimento**: `Fase 15: runCommitWorkflow con active split payment` in `importContabilitaHardening.test.js`.

### 3. IVA per cassa (Differita)
* **Funzionamento**: Attivata tramite policy causale contabile (esigibilità differita). Il registro IVA viene popolato impostando `esigibilita = 'differita'` e l'IVA a credito/debito in prima nota rimane sospesa fino all'effettivo pagamento/incasso.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `ivaPerCassa`), `persistPrimaNotaDraft` (gestione esigibilità per riga IVA).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con IVA per cassa differita` in `importContabilitaHardening.test.js`.

### 4. Reverse Charge, CEE ed Extra-UE (Autofatture)
* **Funzionamento**: Rilevato da tipo causale o flag. Il commit workflow genera automaticamente la doppia annotazione IVA (doppio registro acquisti e vendite) e limita il partitario fornitore all'imponibile, neutralizzando l'effetto dell'imposta a livello finanziario.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `reverseCharge`, `isAutofattura`, `isCee`), `persistPrimaNotaDraft`.
* **Test di riferimento**: `Fase 15: runCommitWorkflow con reverse charge double entry e partitario imponibile` in `importContabilitaHardening.test.js`.

### 5. Nota credito — Parità canonica (Prompt 19)
* **Funzionamento**: Documento con segno opposto rispetto alla fattura, senza compensazione automatica. Il `segnoRegistroIva = '-'` nella policy della causale (rilevato da `buildCausaleContabilePolicy`) porta `persistPrimaNotaDraft` a scrivere la riga IVA con segno negativo nel registro. Import non duplica la logica: si limita a passare la policy dal mapper canonico.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `notaCredito`, `segnoRegistroIva`), `persistPrimaNotaDraft` (segno IVA riga).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con nota credito passiva segno opposto` in `importContabilitaHardening.test.js`.

### 6. Multi-aliquota — Righe IVA distinte preservate (Prompt 19)
* **Funzionamento**: Documento con più righe `DatiRiepilogo` (es. 4%, 10%, 22%). Il commit workflow preserva tutte le righe IVA distinte nel `ivaDraft.rows` senza collassamento, passandole a `persistPrimaNotaDraft` che le inserisce singolarmente in `registri_iva`.
* **Funzione Manuale riusata**: `persistPrimaNotaDraft` / `buildVatRegisterEntriesFromCanonicalPayload` (inserimento righe IVA per riga).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con documento multi-aliquota righe IVA distinte` in `importContabilitaHardening.test.js`.

---
*Stato del Modulo*: **Hardening Completo** per i flussi di Import Contabilità (Prompt 19).
*Riconciliazione Bancaria*: **Rigidamente Bloccata** in attesa del Libro Cespiti (Fase 16).

