# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24B-FIX — Società demo sicura Test Lab.
* **Ultimo prompt eseguito:** Prompt n. 24B-FIX.
* **Ultimo checkpoint valido:** 24B (`a310de8`) + 24B-FIX in corso.

## 2. Roadmap attiva immediata
* **Completato 24B:** Prepara test — 10 casi acquisto ordinario → `runImportWorkflow` → sessionStorage.
* **Completato 24B-FIX:** Provisioning società demo `__TEST__FISCOSIM_DEMO` da Test Lab (Admin/Owner).
* **Prossimo step:** 24C — Ciclo completo commit su società demo + pulizia selettiva.
* **Gate Manuale + Import:** NON superato — validazione manuale Test Lab pendente.
* **Riconciliazione bancaria:** BLOCCATA.

## 3. Stato moduli
* **Test Lab 24B:** Scenario Prepara test attivo; pulsante creazione società demo disponibile.
* **Società demo canonica:** codice `__TEST__FISCOSIM_DEMO`, denominazione `FiscoSim Demo Test Lab SRL`.
* **Import Contabilità:** Commit workflow attivo ma non raggiungibile da Test Lab 24B.

## 4. Regole sicurezza Test Lab
* Criterio DEMO: prefisso `codice` `__TEST__` o `test_`.
* Creazione demo: solo `owner` / `admin`.
* 24B: `runImportWorkflow` sì, `runCommitWorkflow` / `persistPrimaNotaDraft` no.

## 5. Ultimi commit
* `a310de8` — checkpoint: test lab fattura ordinaria acquisto prepara test
* 24B-FIX — checkpoint: societa demo sicura test lab (pending)
