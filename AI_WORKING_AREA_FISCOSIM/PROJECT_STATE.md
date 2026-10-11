# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** L2 + L3 JWT + L4 browser + **SG-P1-01 Import FP22 PASS** (`runCommitWorkflow` -> fiscal LAB).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P1-01:** `aa84ee9b-52fd-4647-a74f-5d5223815360` (`SG-E2E-IMP-FP22-11195558`)
* **PN L4:** `d24cbc82-adc3-4ad8-900f-fe3bdb8617fb`
* **PN JWT L3:** `3af7c706-cdf2-420f-8d18-954e5a728367` (`SG-E2E-JWT-FA22-001`)
* **Limite:** Stage3V port gate BLOCKED (`0.0.0.0`); RPC non scrive `documento_import_id` su PN; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P1-02/03 (NC / multi-aliquota) oppure SG-P0-00 porte (approvazione) per Stage3V formale
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_FP22_COMMIT_20261011195558.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_2026-10-11T1939.txt`
* `REPORT/STAGE3W_JWT_FISCAL_FA22_20261011.txt`
* `REPORT/STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E_20261011.txt`
* `REPORT/STAGE3W_SYNTHETIC_PERSIST_MATRIX_20261011-000635-684.txt`
