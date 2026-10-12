# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-L2 DecisionFeedback **DB LAB PASS** + L4 Import upload/commit LAB PASS. A100 completo ancora gated (P0-03/04 LIVE, cutover prod, collaudi manuali residui).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** `8d97fb1`
* **Limite:** no LIVE mutations; no cutover prod `createPrimaNotaCompleta`

## 2. Prossimo passo operativo (richiede operatore esplicito)
1. P0-03 / P0-04 su LIVE (solo con consenso dedicato + backup/clone)
2. Cutover prod `createPrimaNotaCompleta` solo con consenso esplicito
3. Collaudi manuali residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`)

## 3. Evidenze
* `REPORT/STAGE3W_SG_L2_DECISION_FEEDBACK_DB_2026-10-12T2217.txt` (LE-S01 PASS)
* `REPORT/STAGE3W_L4_BROWSER_IMPORT_UPLOAD_2026-10-12T2210.txt`
* `REPORT/STAGE3W_L4_IMPORT_UPLOAD_COMMIT_LAB_202610122210.txt`
