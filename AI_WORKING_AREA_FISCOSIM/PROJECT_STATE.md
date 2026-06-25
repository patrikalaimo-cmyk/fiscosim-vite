# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 15 — Import Contabilità: Hardening Casi Fiscali Complessi (Prompt 19 — aggiunta copertura nota credito e multi-aliquota commit workflow).
* **Ultimo prompt eseguito:** Prompt n. 19.
* **Ultimo checkpoint valido:** Fase 15 Hardening Prompt 19.
* **Working tree atteso:** Modificato (da committare con patch chirurgica).

## 2. Roadmap attiva immediata
* **Fase corrente:** Fase 15 completata. Gate Manuale/Import 100% allineato.
* **Prossimo step:** Fase 16 — Cespiti leggeri (innesco cespite e libro cespiti prima del via libera banca).
* **Cosa non anticipare:** Riconciliazione Bancaria è rigorosamente BLOCCATA dal gate 100% Manuale/Import (vedi [11_GATE_MANUALE_IMPORT_100.md](file:///C:/Users/patri/Desktop/fiscosim-viteBACKUPAntigravity/AI_WORKING_AREA_FISCOSIM/11_GATE_MANUALE_IMPORT_100.md)).
* **Mantenere divieto** di "Avvia contabilizzazione" automatica su dati reali senza un test controllato successivo.

## 3. Stato moduli
* **Inserimento Manuale:** Completo con gestione storni, modifiche e stati.
* **Consultazione Prima Nota:** Hardened, in sola lettura per modifiche contabili.
* **Registri IVA / Liquidazioni / Stampe definitive:** Fase 13 chiusa, definitiva e consolidata.
* **Import Contabilità:** 
  - Timeout massivo risolto con limit 500 e chunked parsing.
  - Errore colonna inesistente `documenti_import.numero_documento` risolto ripristinando il select a colonne reali e derivando i dati da `ai_raw_response` (view model).
  - Parsing XML FE passiva validato su working table (fornitore, data, numero, imponibile, iva, totale).
  - Dropdown conto, causale contabile e conto esistente in Anagrafiche da verificare validati.
  - Validato con import ZIP massivo reale da ~1034 file su SIRIA SRL.
  - **Prompt 19 hardening**: copertura commit workflow per nota credito (segno opposto, parità canonica), multi-aliquota (3 righe IVA distinte preservate). Tutti i casi fiscali complessi riusano `buildCausaleContabilePolicy` e `persistPrimaNotaDraft` da Registrazione Manuale — nessuna logica duplicata.
  - **Gap documentato**: risoluzione conti IVA split payment con codici parzialmente hardcoded — da estrarre in helper condiviso (Fase futura).
* **Riconciliazione bancaria:** Non avviata / Fuori perimetro attuale.
* **Partitario / Mastrini / Bilancio:** Allineati con le causali e il salvataggio prima nota.
* **Ritenute / CU / 770 / F24:** Integrati a livello di schemi e validazioni.
* **Cespiti:** Fuori perimetro attuale.

## 4. Regole architetturali ferree
* **No legacy:** Non toccare o riutilizzare vecchi import.
* **No write da Consultazione:** La Prima Nota da Import non si edita nella Consultazione standard.
* **No `documenti_import` come contabilità finale:** Serve solo come staging.
* **No SQL/env/auth/RLS:** Vietate modifiche senza autorizzazione esplicita.
* **No `git add .`:** Solo commit selettivi.
* **Report sempre aggiornato.**
* **Schema documenti_import**: Le colonne fisiche sono SOLO: `id, societa_id, societa_destinazione_id, filename, file_path, file_url, mime_type, file_size, tipo_documento, stato, metadata, created_at, updated_at` + access-scope. `numero_documento, data_documento, imponibile, iva, totale` NON esistono. Usare `ai_raw_response` per quei dati.

## 5. Stato fiscale/contabile canonico
* **Stati PN attivi:** `simulata`, `confermata`, `stornata`, `storno`.
* **Bozza:** Ammesso solo come fallback tecnico legacy.
* **Periodi stampati definitivi:** Bloccano qualsiasi inserimento o modifica retroattiva.
* **Split payment, IVA per cassa, Reverse charge, Ritenute:** Integrati.

## 6. Backlog Azioni Massive Import Contabilità (Future)
* **Storico Conto Prevalente**: Quando sarà disponibile lo storico contabilizzazioni per fornitore/documento, confrontare il conto applicato massivamente con il conto prevalente e mostrare alert: "Stai applicando conto X, ma dallo storico per questo fornitore/documento risulta prevalente il conto Y. Modifica o conferma comunque."

## 7. Ultimi commit/checkpoint rilevanti
* Checkpoint Fase 14C: Import contabilità anagrafiche working table (commit `137adda`).
* Checkpoint Fase 14D: Import contabilità azioni massive working table (Prompt n. 17).
* **Checkpoint Fase 15 Prompt 19**: Hardening casi fiscali complessi: +2 test commit workflow (nota credito, multi-aliquota), matrice gate aggiornata, architettura Import→Manuale documentata.
