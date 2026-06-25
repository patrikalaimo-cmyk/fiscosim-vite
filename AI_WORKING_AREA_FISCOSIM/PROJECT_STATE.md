# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 14C — Import Contabilità Anagrafiche e Working Table (Chiusa, testata).
* **Ultimo prompt eseguito:** Prompt n. 15 (Checkpoint Fase 14C).
* **Ultimo checkpoint valido:** Fase 14C (Anagrafiche da verificare e working table stabili).
* **Working tree atteso:** Pulito post-checkpoint (dopo doppio commit).

## 2. Roadmap attiva immediata
* **Fase corrente:** Checkpoint Fase 14C completato.
* **Prossimo step:** Fase 14D — Implementare funzioni massive "Applica conto a tutte le selezionate" e "Applica causale a tutte le selezionate" con relativi alert (nota credito vs fattura).
* **Cosa non anticipare:** Non iniziare Riconciliazione Bancaria né altre fasi successive prima di aver stabilito la gestione delle azioni massive.
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
* **Funzione “Applica conto a tutte le selezionate”** nella working table Import.
* **Funzione “Applica causale contabile a tutte le selezionate”** nella working table Import.
* **Controllo nota credito vs FF**: alert bloccante/conferma "Documento XXX risulta nota credito ma stai applicando FF. Modifica o conferma comunque."
* **Controllo conto vs storico fornitore**: alert bloccante/conferma "Stai applicando conto X ma dallo storico per questo fornitore il conto prevalente è Y. Modifica o conferma."
* Da implementare dopo stabilizzazione parsing/working table/anagrafiche e prima dell'operatività massiva definitiva.

## 7. Ultimi commit/checkpoint rilevanti
* Checkpoint Fase 13E: Blocco periodi stampati definitivo validato.
* Checkpoint Fase 14B: Import contabilità massivo parsing workflow (Prompt n. 12).
