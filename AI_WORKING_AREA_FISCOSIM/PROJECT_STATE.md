# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24B-FIX-3 — Seed contabile minimo società demo Test Lab.
* **Ultimo prompt eseguito:** Prompt n. 24B-FIX-3.
* **Ultimo checkpoint valido:** 24B-FIX-2 (`0a24809`) + 24B-FIX-3 in corso.

## 2. Roadmap attiva immediata
* **Completato 24B-FIX-3:** Seed idempotente piano conti (7), causale FF, causali IVA 22/10/4 per società demo.
* **Prossimo step:** Validazione manuale Import Contabilità post-seed su demo, poi 24C.
* **Riconciliazione bancaria:** BLOCCATA.

## 3. Stato moduli Test Lab
* Società demo: `__TEST__FISCOSIM_DEMO` — payload/schema allineati a DB live.
* Seed contabile demo: pulsante **Prepara dati contabili demo** (Admin/Owner, idempotente).
* Scenario 24B Prepara test: attivo, zero contabilizzazione.
* Ciclo completo: disabilitato.

## 4. Ultimi commit
* `0a24809` — checkpoint: fix schema societa demo test lab
* 24B-FIX-3 — checkpoint: seed contabile minimo societa demo (pending)
