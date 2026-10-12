# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** L4 Import **upload/commit XML browser LAB PASS** (fiscal-journal-post + PN). A100 completo ancora gated (schema DecisionFeedback DB, collaudi manuali pieni, LIVE, cutover).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** (post-commit locale; sync origin dopo push)
* **Limite:** no migration learning DB; no LIVE; no cutover prod

## 2. Prossimo passo operativo (richiede operatore)
1. Schema DecisionFeedback DB solo con approvazione
2. P0-03/P0-04 LIVE + cutover `createPrimaNotaCompleta` solo con consenso
3. Collaudi manuali A100 residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`)

## 3. Evidenze
* `REPORT/STAGE3W_L4_BROWSER_IMPORT_UPLOAD_2026-10-12T2210.txt` (upload→WV→commit fiscal PASS; PN `fe421feb-…` 3 righe)
* `REPORT/STAGE3W_SG_L4_BROWSER_BANK_IVA_*.txt`
* `REPORT/STAGE3W_L4_BROWSER_BANK_2026-10-12T2149.txt`
* `REPORT/STAGE3W_L4_BROWSER_IVA_2026-10-12T2148.txt`
