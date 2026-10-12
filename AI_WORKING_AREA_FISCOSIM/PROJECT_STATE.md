# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-L2 DecisionFeedback **LAB localStorage** (no migration) + Bank match memory boost. A100 completo ancora gated (manuale browser, schema DB learning, LIVE, cutover).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** `207fb07` (locale = origin)
* **Limite:** no migration learning DB senza approvazione; no LIVE; default prod multi-step; debito A100 browser

## 2. Prossimo passo operativo
1. Approvazione schema DecisionFeedback DB (sostituisce localStorage LAB)
2. Residuo A100 UI browser: upload/commit Import, IVA, Bank E2E
3. Non cleanup silente fixture SG-E2E-* / STAGE3V-*; cutover `createPrimaNotaCompleta` solo con consenso

## 3. Evidenze
* `REPORT/STAGE3W_SG_L2_DECISION_FEEDBACK_LAB_*.txt`
* `REPORT/STAGE3W_SG_L1_BANK_WIRE_20261012225849.txt`
* `REPORT/AUDIT_LEARNING_ENGINE.md`
* `REPORT/ARCHITETTURA_LEARNING_ENGINE.md`
* `REPORT/MATRICE_TEST_LEARNING_ENGINE.md`
