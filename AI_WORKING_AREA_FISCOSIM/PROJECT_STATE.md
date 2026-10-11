# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** L2/L3/L4 + P1-01..03 + **SG-P1-04 incasso parziale PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P1-04 pay:** `4aecae78-4dfa-48b3-addb-aa32eb8ce21a` (residuo partita 720)
* **PN P1-04 open:** `59b4b052-b3aa-4cc0-8d53-8780558fc34e`
* **Limite:** Stage3V port gate BLOCKED; RPC non scrive `documento_import_id` su PN; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P1-05 equivalenza Import vs Manuale, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_PAY_PARTIAL_COMMIT_20261011210147.txt`
* `REPORT/STAGE3W_IMPORT_MULTI2210_COMMIT_20261011200447.txt`
* `REPORT/STAGE3W_IMPORT_NC22_COMMIT_20261011200317.txt`
* `REPORT/STAGE3W_IMPORT_FP22_COMMIT_20261011195558.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_2026-10-11T1939.txt`
