# 13_CESPITI_OPERATIVO — FASE 16 CESPITI LEGGERI

Questo documento descrive l'implementazione e il perimetro della Fase 16 - Cespiti leggeri, per intercettare fatture/documenti imputati a conti cespite da Registrazione Manuale e Import Contabilità.

## 1. Perimetro Fase 16 (Cespiti Leggeri)

### Cosa è incluso ora:
* **Intercettazione condivisa**: Utilizzo dell'helper di dominio condiviso `resolveCespiteAccount.js` per identificare se un conto contabile appartiene a un bene ammortizzabile (Immobilizzazioni Materiali/Immateriali).
* **Registrazione Manuale**:
  - All'atto del salvataggio (commit del payload), se viene rilevato un conto cespite nelle righe contabili, il sistema presenta una notifica/avviso non bloccante: *"Documento imputato a conto cespite: preparare scheda cespite?"*.
  - Registrazione della scheda cespite/draft cespite (se confermata dall'utente) all'interno di un backlog o come record pre-compilato nella tabella `beni_ammortizzabili`, senza interrompere il flusso contabile principale.
* **Import Contabilità**:
  - Nella working table di staging dell'Import, se l'utente assegna un conto cespite a una fattura, la riga viene marcata visivamente con un badge *"Potenziale cespite"*.
  - Nel commit workflow di Import (`importContabilitaWorkflow.js`), se un documento contiene righe con conti cespite, il payload canonico include metadati dedicati per segnalare la presenza del cespite. Se il commit ha successo, viene registrata una riga bozza/draft in `beni_ammortizzabili`.
* **Libro cespiti leggero**:
  - Inserimento dei record nella tabella `beni_ammortizzabili` pre-esistente con `attivo = true`.
  - Calcolo del valore residuo e degli anni di vita utile ereditati dal costo storico e dall'aliquota ammortamento.
  - Nessuna prima nota autonoma viene generata dal modulo cespiti.

### Cosa resta futuro (Escluso):
* **Riconciliazione Bancaria**: Rimane rigorosamente bloccata.
* **Ammortamenti automatici completi**: Calcolo e generazione di scritture di prima nota automatiche per le quote di ammortamento a fine anno (saranno implementati in fasi future).
* **Migration di tabelle**: Nessuna modifica strutturale o DDL al database (si usano le tabelle e colonne esistenti).

## 2. Regole di Intercettazione
Il conto viene identificato come cespite se:
1. Il codice conto (depurato da punti, spazi o trattini) inizia con `101` (Immobilizzazioni Immateriali) o `102` (Immobilizzazioni Materiali).
2. Oppure, se il conto è di tipo `'patrimoniale'` ed ha natura `'attivo'`, e la descrizione contiene almeno una delle seguenti parole chiave (case-insensitive):
   `cespite`, `cespiti`, `attrezzatur`, `macchinari`, `mobil`, `arredament`, `automezz`, `software`, `hardware`, `fabbricat`, `terren`, `immobilizzazion`, `impiant`, `brevet`.

## 3. File Coinvolti
* **Nuovo Helper**: [resolveCespiteAccount.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/domain/registrazione/resolveCespiteAccount.js)
* **Registrazione Manuale**: [RegistrazioneManualeView.jsx](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/views/RegistrazioneManualeView.jsx)
* **Import UI**: [index.jsx](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/import_contabilita/index.jsx) ed eventualmente componenti tabellari.
* **Import Workflow**: [importContabilitaWorkflow.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/import_contabilita/application/importContabilitaWorkflow.js)
* **Mappers**: [mapImportContabilitaCommitPayloadToCanonical.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js) e [mapRegistrazioneManualeToCanonical.js](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js).

## 4. Test Obbligatori
* Verifica di riconoscimento del conto cespite (unit test dedicato).
* Test integrazione Registrazione Manuale: fattura con riga cespite identificata e warning/inserimento nel libro cespiti simulato.
* Test integrazione Import Contabilità: working table marcata come potenziale cespite e metadati propagati al commit.
* Verifica che non vengano create registrazioni di prima nota autonome o duplicate.

## 5. Stato Gate Manuale + Import
* **Cespite da fattura**: Passa da **Non coperto** a **Parziale** (manca il motore di ammortamento completo e le registrazioni automatiche di prima nota di fine anno, ma l'aggancio a Manuale + Import è coperto).
