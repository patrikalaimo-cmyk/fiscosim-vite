# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Storico automatismo Import + Bank (server claim ∪ UI) LAB PASS; L4 Cronologia import panel PASS; L6 v3 ancora verde.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Limite:** debito A100 browser dettagliato (upload/commit Import UI, consolidamento IVA UI, Bank UI full); default prod multi-step; no LIVE / no cutover

## 2. Prossimo passo operativo
1. Collaudi A100 residui (`FISCOSIM_MANUAL_TEST_DEBT`) — upload/commit Import UI, consolidamento IVA / LIPE UI, Bank UI end-to-end oltre storico
2. Non cleanup silente fixture SG-E2E-* / STAGE3V-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012204548.txt` (HISTORY_API=PASS)
* `REPORT/STAGE3W_BANK_COMMIT_LAB_20261012204552.txt` (HISTORY_API=PASS + fileHash)
* `REPORT/STAGE3W_L4_BROWSER_IMPORT_2026-10-12T2045.txt` (Cronologia panel)
* `REPORT/STAGE3W_P4_07_COMPLETENESS_20261012204608.txt` (include SG-P3-02)
* `REPORT/STAGE3W_L4_BROWSER_IVA_2026-10-12T2025.txt`
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261012201141.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_2026-10-12T1957.txt`
* `REPORT/STAGE3W_L4_BROWSER_CONSULTAZIONE_2026-10-12T1956.txt`
* `REPORT/STAGE3W_SG_P0_02_GENERAL_JOURNAL_20261012195555.txt`
* `REPORT/LAB_BACKUP_RESTORE_OPERATIVA.md`
