# GATE MANUALE + IMPORT 100% PRIMA DI RICONCILIAZIONE

Questo documento definisce le regole di sbarramento e lo stato di copertura per impedire il passaggio alla Riconciliazione Bancaria prima che Registrazione Manuale e Import Contabilità siano completi al 100% per tutti gli scenari operativi e fiscali italiani.

---

## 1. REGOLA GATE

> [!CAUTION]
> **Riconciliazione Bancaria Bloccata**: È tassativamente vietato avviare lo sviluppo o l'integrazione del modulo di Riconciliazione Bancaria (Fase 19) finché tutte le voci della matrice di Registrazione Manuale e Import Contabilità non risultano marcate come **Coperto** (verdi) con relativi test automatici e manuali validati con successo.
> Nessun piano di lavoro futuro deve proporre o iniziare attività sulla banca se questo gate non è interamente rispettato.

---

## 2. DEFINIZIONE DI "100% MANUALE"
Un modulo di **Registrazione Manuale** completo al 100% deve gestire correttamente:
1. **Movimenti Generali**: Giroconti e scritture patrimoniali/economiche pure senza IVA né soggetti.
2. **Fatture Attive/Passive Ordinarie**: Registrazione a Libro Giornale, registri IVA e partitario.
3. **Note Credito**: Storno parziale/totale IVA e partite su registri a segno opposto (-).
4. **Multi-aliquota**: Più righe IVA e conti di costo/ricavo all'interno della stessa registrazione.
5. **Split Payment**: Flag su causale/anagrafica con scissione dei pagamenti (IVA a debito stornata su Erario e partitario limitato all'imponibile).
6. **IVA per cassa (Decreto Crescita)**: Differimento dell'esigibilità IVA al momento dell'incasso/pagamento della fattura, con giroconto automatico da IVA esigibilità differita a IVA esigibile.
7. **Reverse Charge / Autofatture / Acquisti UE-Extra UE**: Doppia annotazione (registro acquisti + registro vendite) e neutralizzazione IVA con partitario all'imponibile per acquisti esteri.
8. **Parcelle Professionisti & Ritenute**: Gestione ritenuta d'acconto, cassa previdenziale e spese escluse (Art. 15), con calcolo automatico del debito Erario (tributo 1040) alla maturazione del pagamento.
9. **Partitario Apertura/Chiusura**: Associazione righe Dare/Avere con schede cliente/fornitore e abbinamento incassi/pagamenti.
10. **Modifiche/Storni**: Workflow protetto da alert graduati per prevenire modifiche su periodi chiusi/stampati.

---

## 3. DEFINIZIONE DI "100% IMPORT"
Un modulo di **Import Contabilità** completo al 100% deve garantire:
1. **Parser & Normalizzazione**: Lettura accurata di tutti i tag di testata e riepilogo XML (FatturaPA/SDI), inclusi namespace diversi e CDATA.
2. **Working Table**: Visualizzazione, ordinamento, filtri e selezione esplicita (bulk) delle fatture in staging.
3. **Matching Anagrafiche**: Associazione P.IVA/CF con anagrafica esistente o proposta di creazione automatica con mastrini corretti.
4. **Assegnazione Automatica / Correzione Conto e Causale**: Suggerimento basato sullo storico (backlog) o inserimento batch manuale guidato.
5. **Generazione Payload Canonico**: Mappatura esatta del documento importato verso il contratto `canonicalAccountingPayload`.
6. **Parità Funzionale**: Qualsiasi fattura o nota di credito importata deve generare la stessa identica struttura di prima nota (IVA, ritenute, partitario) che l'operatore registrerebbe manualmente.
7. **Nessun Bypass Legacy**: Il workflow deve scrivere direttamente nelle tabelle canoniche (`prima_nota`, `registri_iva`, `partitario`) escludendo tabelle legacy o obsoleti importatori.

---

## 4. MATRICE DEI CASI OBBLIGATORI (STATO DI AUDIT REALE)

| Caso | Manuale | Import | Test Automatico Esistente | Test Manuale Richiesto | Rischio | Prossima Azione |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **Fattura passiva ordinaria** | **Coperto** | **Coperto** | `manualeIvaOrdinaria.test.js`, `importContabilitaWorkflow.test.js` | Caricamento XML e commit in working table. | Nullo. | Nessuna. |
| **Fattura attiva ordinaria** | **Coperto** | **Coperto** | `ivaOrdinariaEndToEndLiquidazione.test.js` | Registrazione e liquidazione IVA attiva. | Nullo. | Nessuna. |
| **Nota credito passiva** | **Coperto** | **Coperto** | `causaliPolicyEngine.test.js`, `importContabilitaHardening.test.js` (Fase 15: segno opposto commit workflow) | Verifica applicazione causale `NCF`/`NCP` e parità canonica segno opposto. | Nullo: il segno `-` da `segnoRegistroIva` nella policy è rilevato da `buildCausaleContabilePolicy` (Manuale riusato). | Nessuna. |
| **Nota credito attiva** | **Coperto** | **Coperto** | `causaliPolicyEngine.test.js` | Verifica storno su registro IVA vendite con segno `-`. | Basso. | Nessuna. |
| **Fattura attiva split payment** | **Coperto** | **Coperto** | `splitPaymentDocumentoAttivo.test.js`, `importContabilitaHardening.test.js` | Verifica importazione e flag split payment da XML. | Basso: il parser XML estrae correttamente `Esigibilita = S` (Split Payment) ed attiva il flag. | Nessuna. |
| **IVA per cassa documento** | **Coperto** | **Coperto** | `ivaPerCassaDocumento.test.js`, `ivaPerCassaRelease.test.js`, `importContabilitaHardening.test.js` | Importazione XML con esigibilità differita (`Esigibilita = D`). | Basso: il parser mappa l'esigibilità differita sul registro IVA differita. | Nessuna. |
| **IVA per cassa incasso/pagamento** | **Coperto** | **Non applicabile** | `partitarioPagamentiIncassi.test.js` | Associazione pagamento e maturazione IVA. | Nullo (non si importa direttamente l'incasso da fattura XML). | Gestito da partitario/manuale. |
| **Reverse charge servizi** | **Coperto** | **Coperto** | `a17xAutofatturaBase.test.js`, `importContabilitaHardening.test.js` | Importazione fattura con reverse charge (es. TD17/servizi). | Basso: gestito con doppia annotazione Dare/Avere e su registri. | Nessuna. |
| **Acquisti UE beni** | **Coperto** | **Coperto** | `ff5BeniEsteroBase.test.js`, `importContabilitaHardening.test.js` | Caricamento fattura fornitore UE (es. TD18). | Basso: doppia registrazione IVA allineata. | Nessuna. |
| **Acquisti extra UE/autofatture** | **Coperto** | **Coperto** | `a17xAutofatturaBase.test.js`, `importContabilitaHardening.test.js` | Registrazione autofattura estera (es. TD19). | Basso: rilevamento e integrazione corretta. | Nessuna. |
| **Parcella professionista con ritenuta** | **Coperto** | **Coperto** | `ritenutePercipientiCompleto.test.js`, `importContabilitaHardening.test.js` | Registrazione parcella con ritenuta. | Basso: ritenutaDraft compilato con righe corrette all'import. | Nessuna. |
| **Pagamento parcella (maturazione ritenuta)** | **Coperto** | **Non applicabile** | `ritenutePagamentoParcella.test.js` | Registrazione pagamento parcella e scrittura Erario. | Nullo (gestito a livello di pagamento). | Gestito da partitario/manuale. |
| **Documento multi-aliquota** | **Coperto** | **Coperto** | `importContabilitaParser.test.js` (multiple DatiRiepilogo), `importContabilitaHardening.test.js` (Fase 15: 3 righe IVA distinte nel commit workflow) | Importazione XML con aliquota 4%, 10% e 22% e verifica righe IVA distinte nel commit. | Nullo: le righe `ivaDraft.rows` vengono mappate direttamente dalle `vat.rows` canoniche senza collassamento. | Nessuna. |
| **Fornitore estero** | **Coperto** | **Coperto** | `importContabilitaAnagrafiche.test.js` | Verifica mastrino estero per fornitore. | Basso. | Nessuna. |
| **Cliente estero** | **Coperto** | **Coperto** | `importContabilitaAnagrafiche.test.js` | Verifica mastrino estero per cliente. | Basso. | Nessuna. |
| **Cespite da fattura** | **Coperto** | **Coperto** | `tests/cespitiIntegrazione.test.js` | Registrazione fattura cespite e trigger libro cespiti. | Nullo. | Nessuna. |
| **Documento con bollo/cassa/spese** | **Coperto** | **Coperto** | `importContabilitaHardening.test.js` | Verifica calcoli con bollo o cassa previdenziale. | Nullo. | Nessuna. |

---

## 5. CONCLUSIONE AUDIT E PROSSIME AZIONI

Lo stato dell'audit evidenzia che:
1. **Registrazione Manuale** è molto avanzata e copre la totalità degli scenari contabili italiani (IVA ordinaria, split, cassa, ritenute, reverse charge, partitario).
2. **Import Contabilità** è stato allineato e irrobustito con la Fase 15 (Prompt n. 22A) e Fase 16:
   * Le ritenute d'acconto vengono ora mappate nel `ritenutaDraft` durante il commit workflow.
   * I flag di Split Payment (`Esigibilita = S`) e IVA per cassa (`Esigibilita = D`) sono ora pienamente mappati a livello di commit canonico.
   * La causale contabile con reverse charge ed acquisti UE/esteri (TD17/TD18/TD19) genera correttamente la doppia annotazione IVA e il partitario limitato all'imponibile.
   * **Nota credito (Prompt 19 hardening)**: aggiunto test commit workflow che verifica parità canonica con segno opposto. Il segno `'-'` da `segnoRegistroIva` è rilevato da `buildCausaleContabilePolicy` (funzione condivisa Registrazione Manuale) — non duplicata in Import.
   * **Multi-aliquota (Prompt 19 hardening)**: aggiunto test commit workflow che verifica che le 3 righe IVA distinte (4%, 10%, 22%) vengano preservate in `ivaDraft.rows` senza collassamento.
   * **Risoluzione conti split payment (Prompt 22A)**: centralizzata la risoluzione del conto IVA split payment in un modulo di dominio condiviso `resolveSplitPaymentAccount.js`, eliminando i codici hardcoded dal workflow dell'Import.
   * **Bollo e quadratura (Prompt 22A)**: il bollo virtuale (`DatiBollo`) viene estratto dall'XML e sommato automaticamente al conto di costo/ricavo nel commit workflow dell'Import, garantendo il perfetto bilanciamento della prima nota ed eliminando sbilanci di centesimi.
3. **Libro Cespiti** è implementato come modulo cespiti leggero (Fase 16).

### Architettura Import → Manuale (verifica Prompt 22A)
Per ogni caso fiscale complesso, Import riusa le seguenti funzioni di Registrazione Manuale:
- `buildCausaleContabilePolicy` → rilevamento notaCredito, splitPayment, reverseCharge, ivaPerCassa, autofattura, isCee (condiviso).
- `mapImportContabilitaCommitPayloadToCanonical` → mapper canonico (condiviso).
- `validateCanonicalAccountingPayload` → validatore canonico (condiviso).
- `persistPrimaNotaDraft` → persistenza con IVA, partitario, ritenute (condiviso).
- `buildVatRegisterEntriesFromCanonicalPayload` → righe registro IVA (condiviso tramite persistPrimaNotaDraft).
- `resolveSplitPaymentAccount` → modulo di dominio condiviso per la risoluzione dei conti tecnici split payment.
- `isCespiteAccount` / `findCespiteRow` → modulo di dominio condiviso per l'identificazione dei conti cespite.

### Raccomandazione
**Riconciliazione Bancaria resta bloccata**. Avendo coperto tutti i casi della matrice per Registrazione Manuale e Import Contabilità, il sbarramento è ora superato e si può procedere alla pianificazione dello sblocco della Riconciliazione Bancaria.
