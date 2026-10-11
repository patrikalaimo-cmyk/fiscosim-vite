# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P2-01 + **SG-P2-02 IVA per cassa PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P2-02 open:** `f380df58-d953-4e47-8026-a7505867200a` (differita 220, partita `iva_per_cassa`)
* **PN P2-02 pay:** `a743eac2-7a28-474a-bbcd-ca04db4392cf` (rilascio 90.16 su incasso 500)
* **Limite:** Stage3V port gate BLOCKED; RPC non scrive `documento_import_id` / `origin_registro_iva_id` su VAT; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P2-03 reverse/estero, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_IVA_CASSA_COMMIT_20261011215836.txt`
* `REPORT/STAGE3W_IMPORT_SPLIT_COMMIT_20261011214946.txt`
* `REPORT/STAGE3W_L4_BROWSER_CONSULTAZIONE_2026-10-11T2110.txt`
* `REPORT/STAGE3W_IMPORT_VS_MANUALE_EQUIV_20261011210322.txt`
* `REPORT/STAGE3W_IMPORT_PAY_PARTIAL_COMMIT_20261011210147.txt`
