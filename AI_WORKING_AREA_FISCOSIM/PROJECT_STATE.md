# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P4 in corso** — P0-00 + P4-01 + P4-02 L6 PASS. Prossimo: SG-P4-03..07.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P0-00:** Porte LAB `55321–55327` bind solo `127.0.0.1`; volume DB preservato; Stage3U/W RPC OK; Kong ephemeral `/home/kong` ripristinato
* **P4-01:** Suite L5 dataset multi-periodo sintetico (2024-11 + 2026-02; FA+FP; fingerprint L5MP1)
* **P4-02:** L6 core pack ripetibile (`l6_lab_core_v1`) — P0_00/P2_06/P2_07/P3_01/P3_03/P3_07/P4_01 fingerprint L6CORE1
* **Limite:** fascicolo non definitiva server; quote ammortamento senza scrittura PN fine anno; default prod multi-step; no LIVE; UI procedura chiusura / tab aging dedicata non esposta; ledger netto mastrini puo divergere; 2025 locked da P3-06 (L5 usa 2024+2026)

## 2. Prossimo passo operativo
1. SG-P4-03..07 stabilizzazione (DISUSO, perf, debito manuale, docs, criterio completo)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261012131055.txt`
* `REPORT/STAGE3W_SG_P0_00_LOOPBACK_20261012130553.txt`
* `REPORT/STAGE3W_L5_MULTI_PERIODO_P4_01_20261012130502.txt`
* `REPORT/STAGE3W_AGING_INSOLUTI_P3_07_20261012125302.txt`
* `REPORT/STAGE3W_CHIUSURA_RIAPERTURA_P3_06_20261012121059.txt`
* `REPORT/STAGE3W_CESPITI_P3_05_20261012114529.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.html`
* `REPORT/STAGE3W_STAMPE_P3_03_20261012092814.txt`
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012091634.txt`
