# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P2-01..04 + **SG-P2-05 pagamento parziale ritenuta PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P2-05 open:** `b4d0519f-4484-4797-a249-e3afef586a23` (rit 200 aperta)
* **PN P2-05 pay partial:** `79f3b404-d7d2-4c1d-9f6c-50cfbe58a567` (partita 534.40; rit residual 100 aperta + matured 100 da_versare; CU ready)
* **Fix:** RPC 57/57a — partial withholding split; no `updated_at` on rit UPDATE
* **Limite:** Stage3V port gate BLOCKED; RPC gaps `documento_import_id` / `origin_registro_iva_id`; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P2-06 controllo F24 importato vs maturato, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_PARTIAL_COMMIT_20261012084308.txt`
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_COMMIT_20261012083354.txt`
* `REPORT/STAGE3W_IMPORT_REVERSE_ESTERO_COMMIT_20261012081416.txt`
* `REPORT/STAGE3W_IMPORT_IVA_CASSA_COMMIT_20261011215836.txt`
* `REPORT/STAGE3W_IMPORT_SPLIT_COMMIT_20261011214946.txt`
