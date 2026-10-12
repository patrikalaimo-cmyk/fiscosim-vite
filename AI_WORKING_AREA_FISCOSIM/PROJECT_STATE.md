# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P3 in corso** — SG-P3-01 PASS. Prossimo: SG-P3-02+ oppure SG-P0-00 porte (approvazione).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P3-01:** Bank commit LAB via Stage3W (`riconciliazione_bancaria` + claim history + idempotency replay)
* **Limite:** Stage3V port gate BLOCKED; default prod multi-step; Bank senza flag resta dry-run; no LIVE

## 2. Prossimo passo operativo
1. SG-P3-02 Cronologia Import UI + hash file (o item P3 successivo), oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_BANK_COMMIT_LAB_20261012091055.txt`
* `REPORT/STAGE3W_P2_07_LIQUIDAZIONE_DEFINITIVA_20261012085609.txt`
* `REPORT/STAGE3W_RITENUTE_F24_CONTROL_20261012085311.txt`
* `REPORT/STAGE3W_IMPORT_PARCELLA_RITENUTA_PARTIAL_COMMIT_20261012084308.txt`
