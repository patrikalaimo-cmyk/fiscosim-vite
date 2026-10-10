# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-P0-01 Stage3W — schema LAB installato (PASS storico); wire Manuale/Import **flag OFF**; path default ancora multi-step.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010` @ `53e1f8e`
* **Worktree:** `C:\Users\patri\FiscoSim-StudioGrade-E2E-20261010`
* **mio-branch:** non toccato (`C:\Users\patri\Desktop\fiscosim-viteBACKUPAntigravity` @ `3af07b4`)
* **Non ripetere:** Stage 3S / 3U / Stage3W install (già PASS)

## 2. Prossimo passo operativo (PC Windows)
1. Avviare **Docker Desktop**
2. Verifica READ-ONLY: container `supabase_db_FiscoSim-P0-LAB-20261008-164658` + RPC Stage3W ancora presenti
3. Smoke HTTP: `scripts/security_p0/smoke-stage3w-fiscal-lab-http.ps1` (atteso 401/403)
4. **Non** eseguire SG-P0-00 (porte) né scritture fiscali persistenti senza nuovo consenso
5. Su consenso: flag LAB ON + prova Manuale/Import sintetica + query post-commit

Runbook: `REPORT/STAGE3W_WINDOWS_LAB_RUNBOOK_20261010.md`

## 3. Artefatti Stage3W
* Contratto: `REPORT/FISCOSIM_FISCAL_ATOMIC_COMMIT_CONTRACT_20261010.md`
* SQL 57/58/59 · API LAB · scenari indipendenti
* Install PASS: `REPORT/STAGE3W_PERSISTENT_LAB_INSTALL_20261010-231404-750.txt`
* Audit/matrice/roadmap: `REPORT/AUDIT_STUDIO_GRADE_20261010.md`, `MATRICE_TEST_CONTABILI_E2E.md`, `ROADMAP_COMPLETAMENTO_STUDIO_GRADE.md`

## 4. Baseline sessione Windows (no DB write)
* `npm run test:all` → **1199/1199 PASS**
* `npm run build` → PASS
* Docker Desktop: spento al momento del refresh
