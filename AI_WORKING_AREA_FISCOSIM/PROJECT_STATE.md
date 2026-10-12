# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** P2-01..05 + **SG-P2-06 F24 vs maturato PASS** (verde/giallo/rosso).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Evidence P2-06:** `REPORT/STAGE3W_RITENUTE_F24_CONTROL_20261012085311.txt` (SUMMARY 1/1/1)
* **Limite:** Stage3V port gate BLOCKED; RPC gaps `documento_import_id` / `origin_registro_iva_id`; default prod multi-step; F24 = controllo su `public.f24` (no compilatore)

## 2. Prossimo passo operativo
1. SG-P2-07 liquidazione da PN reali + blocco definitiva, oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_RITENUTE_F24_CONTROL_20261012085311.txt`
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_PARTIAL_COMMIT_20261012084308.txt`
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_COMMIT_20261012083354.txt`
* `REPORT/STAGE3W_IMPORT_REVERSE_ESTERO_COMMIT_20261012081416.txt`
* `REPORT/STAGE3W_IMPORT_IVA_CASSA_COMMIT_20261011215836.txt`
