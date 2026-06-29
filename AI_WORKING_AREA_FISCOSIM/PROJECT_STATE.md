# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Fase 24E — Commit reale controllato da Working View Import (1 documento demo).
* **Ultimo prompt eseguito:** Prompt n. 24E.
* **Ultimo checkpoint valido:** 24B-FIX-3 seed contabile + 24D/24D-FIX + 24E in corso di commit.

## 2. Roadmap attiva immediata
* **Completato 24E (codice):** Commit singolo demo da working view con guardie PN/IVA/Partitario; payload da draft working view; report esito.
* **Prossimo step:** Validazione manuale utente su TL-ACQ-01 (commit reale in DB demo).
* **Riconciliazione bancaria:** BLOCCATA.

## 3. Stato moduli Test Lab
* Società demo: `__TEST__FISCOSIM_DEMO` — payload/schema allineati a DB live.
* Seed contabile demo: pulsante **Prepara dati contabili demo** (Admin/Owner, idempotente).
* Scenario 24B Prepara test: attivo (10 fatture acquisto staging).
* Commit: **solo 1 documento** da working view Import su società demo (24E).
* Ciclo completo massivo: disabilitato (messaggio 24E).

## 4. Ultimi commit
* `558e68f` — checkpoint: seed contabile minimo societa demo
* 24E — checkpoint: import demo commit controllato working view (pending)
