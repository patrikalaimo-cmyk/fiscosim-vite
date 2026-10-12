# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-L3 context keys + consume DecisionFeedback LAB **PARTIAL**; SG-L6 UI explanation IVA **PARTIAL**. A100 completo ancora gated.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** (post-commit)
* **Limite:** no migration learning DB; no LIVE; debito browser A100; mass-confirm Bank aperto

## 2. Prossimo passo operativo
1. Schema DecisionFeedback DB solo con approvazione; oppure browser A100 Import/IVA/Bank
2. History adapter multi-prodotto nativo (oltre feedback); mass-confirm gated Bank
3. Non cleanup silente fixture; cutover `createPrimaNotaCompleta` solo con consenso

## 3. Evidenze
* `REPORT/STAGE3W_SG_L3_L6_CONTEXT_FEEDBACK_*.txt`
* `REPORT/STAGE3W_SG_L2_DECISION_FEEDBACK_LAB_20261012230501.txt`
* `REPORT/STAGE3W_SG_L1_BANK_WIRE_20261012225849.txt`
