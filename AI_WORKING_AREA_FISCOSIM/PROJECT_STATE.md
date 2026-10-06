# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24E-CHECKPOINT — Primo ciclo reale Import demo PN/IVA/Partitario validato.
* **Ultimo prompt eseguito:** Prompt n. 24E-CHECKPOINT.
* **Ultimo checkpoint valido:** `eca9fc0` + validazione manuale utente TL-ACQ-02.

## 2. Roadmap attiva immediata
* **Completato 24E:** Ciclo core validato su TL-ACQ-02 (Import → Working View → Commit → PN → IVA → Partitario).
* **Prossimo step:** Commit controllato TL-ACQ-03…10; hardening staging UUID reale; UI Partitario dedicata.
* **Riconciliazione bancaria:** BLOCCATA.

## 3. Stato moduli Test Lab
* Società demo: `__TEST__FISCOSIM_DEMO`.
* Commit: 1 documento per volta da working view (24E).
* TL-ACQ-01: dato demo sporco pre-fix — non riferimento valido.
* TL-ACQ-02+: casi validi post-fix.

## 4. Ultimi commit
* `eca9fc0` — fix(import): persist real supplier ledger in demo commit
* `59a893e` — checkpoint: import demo commit controllato working view
