# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** L2/L3/L4 + **SG-P1-01 FP22** + **SG-P1-02 NC attiva PASS** (Import -> fiscal LAB).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P1-02:** `07652403-a8c2-4b0c-a922-28e7ce802214` (`SG-E2E-IMP-NC22-11200317`)
* **PN P1-01:** `aa84ee9b-52fd-4647-a74f-5d5223815360` (`SG-E2E-IMP-FP22-11195558`)
* **Limite:** Stage3V port gate BLOCKED; RPC non scrive `documento_import_id` su PN; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P1-03 multi-aliquota 22+10 oppure SG-P0-00 porte (approvazione) per Stage3V formale
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_NC22_COMMIT_20261011200317.txt`
* `REPORT/STAGE3W_IMPORT_FP22_COMMIT_20261011195558.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_2026-10-11T1939.txt`
* `REPORT/STAGE3W_JWT_FISCAL_FA22_20261011.txt`
* `REPORT/STAGE3W_LIQUIDAZIONE_CONSOLIDAMENTO_SGE2E_20261011.txt`
