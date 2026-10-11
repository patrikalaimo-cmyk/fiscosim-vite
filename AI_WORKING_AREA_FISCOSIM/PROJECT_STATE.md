# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P1 chiuso + **SG-P2-01 Import split payment PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P2-01 split:** `654c7b14-0044-4a6b-a8e8-9fe5f1867e88` (partita 1000, claim `split_attiva`)
* **Liquidazione:** debito effettivo 0 su doc split (IVA 220 esclusa)
* **Limite:** Stage3V port gate BLOCKED; RPC non scrive `documento_import_id` su PN; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P2-02 IVA per cassa E2E, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_SPLIT_COMMIT_20261011214946.txt`
* `REPORT/STAGE3W_L4_BROWSER_CONSULTAZIONE_2026-10-11T2110.txt`
* `REPORT/STAGE3W_IMPORT_VS_MANUALE_EQUIV_20261011210322.txt`
* `REPORT/STAGE3W_IMPORT_PAY_PARTIAL_COMMIT_20261011210147.txt`
* `REPORT/STAGE3W_IMPORT_FP22_COMMIT_20261011195558.txt`
