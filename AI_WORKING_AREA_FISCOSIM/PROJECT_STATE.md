# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** **P3 chiusa** — SG-P3-01..07 PASS. Prossimo: P4 stabilizzazione oppure SG-P0-00 porte (approvazione).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **P3-07:** Aging/insoluti da residui partitario; bucket overdue; coerenza ≡ partitari.totaleAperto + apertura PN in mastrini
* **Limite:** Stage3V port gate BLOCKED; fascicolo non definitiva server; quote ammortamento senza scrittura PN fine anno; default prod multi-step; no LIVE; UI procedura chiusura / tab aging dedicata non esposta; ledger netto mastrini puo divergere (riapertura SP / movimenti non partitario)

## 2. Prossimo passo operativo
1. P4 (L5/L6 / DISUSO / performance) oppure SG-P0-00 porte (approvazione)
2. Non cleanup silente fixture SG-E2E-*
3. Cutover default `createPrimaNotaCompleta` solo con consenso esplicito

## 3. Evidenze
* `REPORT/STAGE3W_AGING_INSOLUTI_P3_07_20261012125302.txt`
* `REPORT/STAGE3W_CHIUSURA_RIAPERTURA_P3_06_20261012121059.txt`
* `REPORT/STAGE3W_CESPITI_P3_05_20261012114529.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.txt`
* `REPORT/STAGE3W_FASCICOLO_P3_04_20261012113815.html`
* `REPORT/STAGE3W_STAMPE_P3_03_20261012092814.txt`
* `REPORT/STAGE3W_IMPORT_CRONOLOGIA_HASH_20261012091634.txt`
