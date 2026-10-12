# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** SG-L4 regole studio **PASS** (UNIT) + L4 browser IVA/Bank **PASS**. A100 completo ancora gated (upload/commit Import dettagliato, schema DB, LIVE, cutover).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** (post-commit)
* **Limite:** no migration learning DB; no LIVE; debito browser Import upload/commit XML

## 2. Prossimo passo operativo
1. Browser A100 Import upload/commit XML (oltre smoke shell)
2. Schema DecisionFeedback DB solo con approvazione
3. Non cleanup silente fixture; cutover `createPrimaNotaCompleta` solo con consenso

## 3. Evidenze
* `REPORT/STAGE3W_SG_L4_BROWSER_BANK_IVA_*.txt`
* `REPORT/STAGE3W_L4_BROWSER_BANK_2026-10-12T2149.txt`
* `REPORT/STAGE3W_L4_BROWSER_IVA_2026-10-12T2148.txt`
* `REPORT/STAGE3W_SG_L3_HISTORY_L6_MASS_CONFIRM_20261012232650.txt`
