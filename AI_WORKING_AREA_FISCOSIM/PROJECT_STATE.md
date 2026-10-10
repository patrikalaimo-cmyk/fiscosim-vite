# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-P0-01 — contratto fiscale atomico + candidata Stage3W (codice/CI), LAB PostgreSQL non eseguito in Cloud.
* **Branch lavoro:** `feat/studio-grade-accounting-e2e-20261010` (worktree isolato).
* **PR:** https://github.com/patrikalaimo-cmyk/fiscosim-vite/pull/3 (Draft → base P0).
* **Base P0:** `security/p0-isolated-hardening-20261008` @ `ceac722…`.
* **Branch ordinario:** `mio-branch` — non toccato.
* **Checkpoint sessione precedente:** `f6c874a` (audit/matrice/roadmap).

## 2. Roadmap attiva immediata
* **Completato SG-P0-01 (codice):** contratto documentato, scenari numerici indipendenti, RPC `fiscosim_post_fiscal_journal` LAB-only, matrix SQL, preflight READ ONLY, API LAB non cablata a UI, CI estesa a branch Studio Grade/P0.
* **Prossimo (approvazione):** rehearsal ROLLBACK Stage3W sul Docker P0 Windows; poi eventuale install persistente.
* **Bloccato senza consenso:** SG-P0-00 porte LAB, scritture persistenti, wire Manuale/Import.
* **Non ripetere:** Stage 3S / Stage 3U.

## 3. Documenti chiave
* `REPORT/FISCOSIM_FISCAL_ATOMIC_COMMIT_CONTRACT_20261010.md`
* `REPORT/AUDIT_STUDIO_GRADE_20261010.md`
* `REPORT/MATRICE_TEST_CONTABILI_E2E.md`
* `REPORT/ROADMAP_COMPLETAMENTO_STUDIO_GRADE.md`

## 4. Vincoli
* Nessuna scrittura LIVE / merge `mio-branch` / deploy / recreate Docker.
* Staging git selettivo.
