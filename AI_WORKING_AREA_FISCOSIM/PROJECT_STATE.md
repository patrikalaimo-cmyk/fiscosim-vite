# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24A — Fondazione sicura società demo / Test Lab (recinto sicurezza, nessun ciclo contabile).
* **Ultimo prompt eseguito:** Prompt n. 24A.
* **Ultimo checkpoint valido:** Fase 16 Cespiti leggeri (commit `288f274`) + 24A in corso.
* **Working tree atteso:** Modificato (Test Lab recinto + documentazione).

## 2. Roadmap attiva immediata
* **Fase corrente completata parzialmente:** 24A recinto demo Test Lab.
* **Prossimo step:** 24B — Prepara test (generazione + import workflow su società demo).
* **Cosa non anticipare:** Riconciliazione Bancaria **bloccata** fino a validazione Test Lab + matrice gate manuale.
* **Gate Manuale + Import:** **NON superato** finché Test Lab e matrice test manuale non sono validati end-to-end.

## 3. Stato moduli
* **Inserimento Manuale:** Completo operativamente; write via `persistPrimaNotaDraft`.
* **Import Contabilità:** Commit workflow canonico attivo; write via `runCommitWorkflow`.
* **Test Lab (24A):** Solo recinto — `isDemoCompany`, banner, scenari disabilitati. **Nessuna** fattura/import/contabilizzazione.
* **Cespiti:** Aggancio leggero/parziale Fase 16 (non studio-grade). Libro cespiti completo e ammortamenti automatici = futuro.
* **Riconciliazione bancaria:** **BLOCCATA**.

## 4. Regole architetturali ferree
* Criterio DEMO: prefisso `codice` `__TEST__` o `test_` — no euristica denominazione.
* No write Test Lab in 24A.
* No migration/env/auth/RLS senza task esplicito.
* No `git add .` — commit selettivi.
* Report sempre aggiornato in `REPORT/REPORT_CODEX.md`.

## 5. Stato fiscale/contabile canonico
Invariato rispetto a checkpoint Fase 16.

## 6. Backlog Test Lab
* **24B:** Prepara test, tag `[TEST_LAB]`, import in-memory.
* **24C:** Ciclo commit reale su demo + pulizia selettiva.

## 7. Ultimi commit/checkpoint rilevanti
* `288f274` — checkpoint: cespiti leggeri aggancio manuale import
* 24A — checkpoint: fondazione sicura societa demo test lab (pending)
