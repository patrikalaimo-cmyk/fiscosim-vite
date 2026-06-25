# IMPORT CONTABILITÀ OPERATIVO — HARDENING CASI FISCALI COMPLESSI

Questo documento descrive il consolidamento dell'Import Contabilità per la gestione dei casi fiscali complessi prima del passaggio al motore di Riconciliazione Bancaria.

## Casi Fiscali Consolidati in Fase 15

### 1. Ritenute d'acconto (Parcelle Professionisti)
* **Funzionamento**: In presenza di ritenuta (rilevata da flag o da tag `DatiRitenuta` XML), il commit workflow dell'import compila correttamente `ritenutaDraft` popolando il record del percipiente (`percipienteRecord`) e le righe della ritenuta con compenso, base, aliquota, importo ritenuta e netto a pagare.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `gestioneRitenute`), `persistPrimaNotaDraft` (inserimento `ritenute_dacconto`).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con ritenuta d acconto percipiente` in `importContabilitaHardening.test.js`.

### 2. Split Payment (Scissione dei pagamenti)
* **Funzionamento**: Attivato in anagrafica cliente (soggetto pubblico/PA). Il commit workflow esclude la riga IVA dall'inserimento in prima nota righe, riduce il debito/credito v/cliente al solo imponibile e inserisce la riga del partitario sul solo imponibile. Inoltre, inserisce due righe tecniche di evidenza split payment (Dare/Avere) per allineare il Libro Giornale.
* **Funzione condivisa**: La risoluzione del conto IVA split payment è stata centralizzata nel dominio condiviso [resolveSplitPaymentAccount.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/domain/registrazione/resolveSplitPaymentAccount.js) (`resolveSplitPaymentAccountDb` per il workflow asincrono di Import e `resolveSplitPaymentAccountCatalog` per il rendering in-memory della Registrazione Manuale). Questo elimina qualsiasi codice conto hardcoded (`1.03.01.001`, `2.04.01.001`) a livello di Import.
* **Test di riferimento**: `Fase 15: runCommitWorkflow con active split payment` in `importContabilitaHardening.test.js`.

### 3. IVA per cassa (Differita)
* **Funzionamento**: Attivato tramite policy causale contabile (esigibilità differita). Il registro IVA viene popolato impostando `esigibilita = 'differita'` e l'IVA a credito/debito in prima nota rimane sospesa fino all'effettivo pagamento/incasso.
* **Funzione Manuale riusata**: `buildCausaleContabilePolicy` (rilevamento `ivaPerCassa`), `persistPrimaNotaDraft` (gestione esigibilità per riga IVA).
* **Test di riferimento**: `Fase 15: runCommitWorkflow con IVA per cassa differita` in `importContabilitaHardening.test.js`.

### 4. Reverse Charge, CEE ed Extra-UE (Autofatture)
* **Funzionamento**: Rilevato da tipo causale o flag. Il commit workflow genera automaticamente la doppia annotazione IVA (doppio registro acquisti e vendite) e limita il partitario fornitore all'imponibile, neutralizzando l'effetto dell'imposta a livello finanziario. La riga IVA originale viene identificata tramite euristica dell'importo senza codici conto fissi.
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

### 7. Gestione Bollo e Cassa Previdenziale (Prompt 22A)
* **Bollo (Stamp Duty)**: Il tag `DatiBollo` viene estratto dal parser XML e mappato nel payload canonico in `totals.stampDuty`. Per preservare la quadratura Dare/Avere (sbilanciata dalla presenza del bollo virtuale non soggetto a IVA ma incluso nel totale lordo dovuto al soggetto), il commit workflow dell'Import somma il bollo direttamente sul conto di costo/ricavo associato al documento.
  * **Test di riferimento**: `Fase 15: runCommitWorkflow con bollo (spese accessorie) - quadratura e sbilancio risolti` in `importContabilitaHardening.test.js`.
* **Cassa Previdenziale**: Viene estratta dal parser XML come informazione di testata (`parsed.cassaPrevidenziale`). Il suo importo confluisce nella base imponibile e nelle righe IVA del riepilogo XML (DatiRiepilogo), quindi la quadratura del totale è preservata. Non viene inserita in una riga di costo autonoma (cassa previdenziale a debito/credito) in assenza di impostazioni o mappature percipiente dedicate: la cassa viene registrata cumulativamente nel costo della prestazione.
  * **Gap Documentato**: Per una gestione disgiunta o analitica della cassa previdenziale e delle spese accessorie (es. addebito spese bancarie o imballo non imponibili), sarà necessario introdurre nel piano dei conti/società conti di ricavo/costo specifici per accessori da valorizzare in sede di importazione (Fase futura).

---
*Stato del Modulo*: **Hardening Completo** per i flussi di Import Contabilità (Prompt 22A).
*Riconciliazione Bancaria*: **Rigidamente Bloccata** in attesa del Libro Cespiti (Fase 16).

