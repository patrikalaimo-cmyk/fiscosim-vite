# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P2-01..03 + **SG-P2-04 parcella/ritenuta 1040 PASS**.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **PN P2-04 open:** `4a9165fc-0c7a-4680-ad98-726962975827` (1268.80; partita 1068.80; rit 200/1040 aperta)
* **PN P2-04 pay:** `8690fa36-e639-4cd6-9923-33521d649ce0` (rit da_versare; partita chiusa; CU ready)
* **Fix:** RPC 57/57a — no `updated_at` on `ritenute_dacconto` UPDATE (PG 42703)
* **Limite:** Stage3V port gate BLOCKED; RPC gaps `documento_import_id` / `origin_registro_iva_id`; default prod multi-step

## 2. Prossimo passo operativo
1. SG-P2-05 pagamento parziale ritenuta, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_COMMIT_20261012083354.txt`
* `REPORT/STAGE3W_IMPORT_REVERSE_ESTERO_COMMIT_20261012081416.txt`
* `REPORT/STAGE3W_IMPORT_IVA_CASSA_COMMIT_20261011215836.txt`
* `REPORT/STAGE3W_IMPORT_SPLIT_COMMIT_20261011214946.txt`
* `REPORT/STAGE3W_L4_BROWSER_CONSULTAZIONE_2026-10-11T2110.txt`
