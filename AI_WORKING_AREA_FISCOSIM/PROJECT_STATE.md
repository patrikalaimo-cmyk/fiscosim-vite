# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-L1 SuggestionResolver Import **PASS** (no migration) + Bank wire partitario live + fix id `demo-bm-*`. A100 completo ancora gated (manuale browser, LIVE, cutover, SG-L2+ schema).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** `be8438a` (locale = origin).
* **Limite:** no migration learning senza approvazione; no LIVE; default prod multi-step; debito A100 browser dettagliato

## 2. Prossimo passo operativo
1. SG-L2 DecisionFeedback (LAB) solo dopo approvazione schema
2. Residuo A100 UI: upload/commit Import, IVA consolidamento, Bank E2E browser
3. Non cleanup silente fixture SG-E2E-* / STAGE3V-*; cutover `createPrimaNotaCompleta` solo con consenso

## 3. Evidenze
* `REPORT/STAGE3W_SG_L1_BANK_WIRE_*.txt` (UNIT L1+Bank PASS)
* `REPORT/AUDIT_LEARNING_ENGINE.md`
* `REPORT/ARCHITETTURA_LEARNING_ENGINE.md`
* `REPORT/MATRICE_TEST_LEARNING_ENGINE.md`
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012204548.txt` (HISTORY_API=PASS)
* `REPORT/STAGE3W_BANK_COMMIT_LAB_20261012204552.txt` (HISTORY_API=PASS)
* `REPORT/STAGE3W_L4_BROWSER_IMPORT_2026-10-12T2045.txt`
* `REPORT/STAGE3W_P4_07_COMPLETENESS_20261012204608.txt`
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261012201141.txt`
