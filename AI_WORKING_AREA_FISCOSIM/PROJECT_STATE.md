# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24B — Test Lab Prepara test fattura ordinaria acquisto 10 casi.
* **Ultimo prompt eseguito:** Prompt n. 24B.
* **Ultimo checkpoint valido:** 24A (`a9afc8b`) + 24B in corso.

## 2. Roadmap attiva immediata
* **Completato 24B:** Prepara test — 10 casi acquisto ordinario → `runImportWorkflow` → sessionStorage.
* **Prossimo step:** 24C — Ciclo completo commit su società demo + pulizia selettiva.
* **Gate Manuale + Import:** NON superato — Test Lab 24B validazione manuale pendente.
* **Riconciliazione bancaria:** BLOCCATA.

## 3. Stato moduli
* **Test Lab 24B:** Scenario "Fattura ordinaria acquisto" abilitato in modalità Prepara test. Zero contabilizzazione.
* **Import Contabilità:** Commit workflow attivo ma non raggiungibile da Test Lab 24B.
* **Cespiti:** Aggancio leggero parziale — non studio-grade.

## 4. Regole sicurezza Test Lab
* Criterio DEMO: prefisso `codice` `__TEST__` o `test_`.
* 24B: `runImportWorkflow` sì, `runCommitWorkflow` / `persistPrimaNotaDraft` no.
* Snapshot solo sessionStorage — no DB staging.

## 5. Ultimi commit
* `a9afc8b` — checkpoint: fondazione sicura societa demo test lab
* 24B — checkpoint: test lab fattura ordinaria acquisto prepara test (pending commit)
