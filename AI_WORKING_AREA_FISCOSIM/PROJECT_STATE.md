# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** L2/L3/L4 + P1-01..04 + **SG-P1-05 Import vs Manuale equiv PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P1-05 Import:** `180491a6-b632-41da-b4e8-b16776013565` (source `import_contabilita`)
* **PN P1-05 Manuale:** `f301965b-cfbc-4a4e-93f7-2b43cc182158` (source `registrazione_manual`)
* **Hash effetti:** `a6a392c3b58a892278564d6f63919090df5601e09e83e4173d8c597ed2c36d14` (identico)
* **Limite:** Stage3V port gate BLOCKED; RPC non scrive `documento_import_id` su PN; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P1-06 consultazione, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_VS_MANUALE_EQUIV_20261011210322.txt`
* `REPORT/STAGE3W_IMPORT_PAY_PARTIAL_COMMIT_20261011210147.txt`
* `REPORT/STAGE3W_IMPORT_MULTI2210_COMMIT_20261011200447.txt`
* `REPORT/STAGE3W_IMPORT_NC22_COMMIT_20261011200317.txt`
* `REPORT/STAGE3W_IMPORT_FP22_COMMIT_20261011195558.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_2026-10-11T1939.txt`
