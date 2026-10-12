# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P0-02 gate LAB** (readiness + fiscal JWT L3 PASS; harness generale STAGE3V-* SKIP no fixtures) + L6 `l6_lab_core_v2` PASS.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P0-00/P4:** chiusi (automatismi); L6 include ora anche P4-03 isolation
* **Limite:** fixture `STAGE3V-*` assenti (general-journal harness formale); collaudi browser; default prod multi-step; no LIVE

## 2. Prossimo passo operativo
1. Provisioning società `STAGE3V-*` LAB per chiudere harness general-journal A/B (SG-P0-02 completo)
2. Sessione collaudi manuali browser (`FISCOSIM_MANUAL_TEST_DEBT`)
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_SG_P0_02_STAGE3V_JWT_20261012195212.txt`
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261012195227.txt`
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
