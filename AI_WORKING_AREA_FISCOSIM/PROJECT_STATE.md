# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P3 in corso** — SG-P3-01..02 PASS. Prossimo: SG-P3-03+ oppure SG-P0-00 porte (approvazione).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P3-02:** Cronologia Import UI + file hash in claim Stage3W (`reason` fileHash/file) + history query
* **Limite:** Stage3V port gate BLOCKED; default prod multi-step; Bank/Import senza flag resta dry-run; no LIVE

## 2. Prossimo passo operativo
1. SG-P3-03 Stampe Partitari/Mastrini/Bilancio da PN (no mock) (o item P3 successivo), oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012091634.txt`
* `REPORT/STAGE3W_BANK_COMMIT_LAB_20261012091055.txt`
* `REPORT/STAGE3W_P2_07_LIQUIDAZIONE_DEFINITIVA_20261012085609.txt`
