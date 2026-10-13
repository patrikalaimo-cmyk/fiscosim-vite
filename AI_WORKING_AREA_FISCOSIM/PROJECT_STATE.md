# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Prod fiscosim-v6 live. LIVE P0-04 D→G: **BROAD_TRUE=0** + smoke Contabilità post-G OK. Gate A100 residuo = collaudi manuali (non sicurezza allow_all).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Limite:** Import #11 + form Manuale/IVA/Consultazione; Stage3W API Hobby; `invii_log`/`revisioni` uid-only

## 2. Prossimo passo operativo (verso A100)
1. ~~Smoke Contabilità post-F/G~~ OK
2. Collaudi manuali residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`) — **serve operatore**
3. Opzionale: Pro/Hobby API Stage3W; tenant colonna su `invii_log`/`revisioni`

## 3. Evidenze
* `REPORT/LIVE_DEPLOY_SMOKE_POST_CLASS_G_2026-10-13T0226.txt`
* `REPORT/LIVE_P0_04_CLASS_G_APPLY_2026-10-13T0025.txt` (broad 8→0)
* `REPORT/LIVE_DEPLOY_SMOKE_CONTABILITA_POST_RLS_2026-10-13T0224.txt`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`