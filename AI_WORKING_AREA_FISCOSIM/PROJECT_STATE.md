# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P2-01..02 + **SG-P2-03 reverse/estero PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P2-03 reverse:** `e17ed2c9-9d0b-4874-ae22-79ff12f091a7` (partita 1000, VAT doppia, liq saldo 0)
* **Gap:** `resolveFiscalContractKind` con dual VAT inferisce `fattura_attiva` (effetti PG/liquidazione OK)
* **Limite:** Stage3V port gate BLOCKED; RPC gaps `documento_import_id` / `origin_registro_iva_id`; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P2-04 parcella + ritenuta 1040, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_REVERSE_ESTERO_COMMIT_20261012081416.txt`
* `REPORT/STAGE3W_IMPORT_IVA_CASSA_COMMIT_20261011215836.txt`
* `REPORT/STAGE3W_IMPORT_SPLIT_COMMIT_20261011214946.txt`
* `REPORT/STAGE3W_L4_BROWSER_CONSULTAZIONE_2026-10-11T2110.txt`
