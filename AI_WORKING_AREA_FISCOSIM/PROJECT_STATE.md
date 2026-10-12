# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P4 chiusa (automatismi LAB)** — P0-00 + P4-01..07 PASS. Debito browser/manual resta aperto.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P0-00:** Porte LAB loopback-only; volume preservato; Stage3V ready
* **P4:** L5 + L6 + legacy isolation + perf baseline + manual-debt cross-ref + backup/restore doc + completeness gate
* **Limite:** collaudi browser (`FISCOSIM_MANUAL_TEST_DEBT`); fascicolo non definitiva server; default prod multi-step; no LIVE; UI chiusura/aging non esposta; 500+ doc SLA non certificata

## 2. Prossimo passo operativo
1. Sessione collaudi manuali browser (debito A100) su società di test
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_P4_07_COMPLETENESS_20261012131449.txt`
* `REPORT/STAGE3W_P4_04_PERF_BASELINE_20261012131432.txt`
* `REPORT/STAGE3W_P4_03_LEGACY_ISOLATION_20261012131320.txt`
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261012131055.txt`
* `REPORT/STAGE3W_SG_P0_00_LOOPBACK_20261012130553.txt`
* `REPORT/LAB_BACKUP_RESTORE_OPERATIVA.md`
* `REPORT/STAGE3W_AGING_INSOLUTI_P3_07_20261012125302.txt`
* `REPORT/STAGE3W_CHIUSURA_RIAPERTURA_P3_06_20261012121059.txt`
* `REPORT/STAGE3W_CESPITI_P3_05_20261012114529.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.html`
* `REPORT/STAGE3W_STAMPE_P3_03_20261012092814.txt`
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012091634.txt`
