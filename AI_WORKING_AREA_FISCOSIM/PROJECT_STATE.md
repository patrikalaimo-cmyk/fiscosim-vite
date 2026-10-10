# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-P0-01 Stage3W — codice/CI pronti; **rehearsal LAB Windows approvata**, in attesa esecuzione operatore (Cloud senza Docker).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010` · PR #3 Draft
* **mio-branch:** non toccato
* **Non ripetere:** Stage 3S / 3U

## 2. Prossimo passo operativo (PC Windows)
1. Allineare worktree Studio Grade all’HEAD del branch
2. Preflight READ ONLY Stage3W
3. Rehearsal ROLLBACK Stage3W (approvata)
4. Allegare report in chat
5. **Non** eseguire install persistente senza nuova approvazione

Runbook: `REPORT/STAGE3W_WINDOWS_LAB_RUNBOOK_20261010.md`

## 3. Artefatti Stage3W
* Contratto: `REPORT/FISCOSIM_FISCAL_ATOMIC_COMMIT_CONTRACT_20261010.md`
* SQL 57/58/59 · API LAB · scenari indipendenti
* Matrix: FA22, pay 720, NC −1220, split 1000, parcella+rit.200, late-audit
* Install persistente gated: `run-stage3w-fiscal-persistent-lab-install.ps1` (**non eseguito**)
