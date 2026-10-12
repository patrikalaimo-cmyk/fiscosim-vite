# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P4 in corso** — SG-P0-00 loopback PASS + SG-P4-01 L5 PASS. Prossimo: SG-P4-02 L6 regressione LAB.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P0-00:** Porte LAB `55321–55327` bind solo `127.0.0.1`; volume DB preservato; Stage3U/W RPC OK; Kong ephemeral `/home/kong` ripristinato
* **P4-01:** Suite L5 dataset multi-periodo sintetico (2024-11 + 2026-02; FA+FP; fingerprint L5MP1; invarianti PN/VAT/partite)
* **Limite:** fascicolo non definitiva server; quote ammortamento senza scrittura PN fine anno; default prod multi-step; no LIVE; UI procedura chiusura / tab aging dedicata non esposta; ledger netto mastrini puo divergere; 2025 locked da P3-06 (L5 usa 2024+2026)

## 2. Prossimo passo operativo
1. SG-P4-02 L6 regressione LAB ripetibile (+ resto P4)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_SG_P0_00_LOOPBACK_20261012130553.txt`
* `REPORT/STAGE3W_L5_MULTI_PERIODO_P4_01_20261012130502.txt`
* `REPORT/STAGE3W_AGING_INSOLUTI_P3_07_20261012125302.txt`
* `REPORT/STAGE3W_CHIUSURA_RIAPERTURA_P3_06_20261012121059.txt`
* `REPORT/STAGE3W_CESPITI_P3_05_20261012114529.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.html`
* `REPORT/STAGE3W_STAMPE_P3_03_20261012092814.txt`
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012091634.txt`
