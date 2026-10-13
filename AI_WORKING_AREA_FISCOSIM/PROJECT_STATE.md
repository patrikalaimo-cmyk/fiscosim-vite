# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Prod fiscosim-v6 live. LIVE P0-04 D+E+hotfix+F: broad true policies **31→8**. Anon containment OK. Serve smoke Contabilità operatore post-RLS.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Limite:** 8 allow_all residui; Import #11; form Manuale/IVA/Consultazione; Stage3W API Hobby

## 2. Prossimo passo operativo (verso A100)
1. **Smoke Contabilità LIVE** post class F (login + Prima Nota su fiscosim-v6)
2. Collaudi manuali residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`)
3. Residui 8 allow_all (piano `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`)
4. Opzionale: Pro/Hobby API Stage3W

## 3. Evidenze
* `REPORT/LIVE_P0_04_CLASS_F_APPLY_2026-10-13T0018.txt` (broad 19→8)
* `REPORT/LIVE_P0_04_CLASS_E_HOTFIX_2026-10-13T0018.txt`
* `REPORT/LIVE_P0_04_CLASS_D_APPLY_2026-10-13T0016.txt`
* `REPORT/LIVE_DEPLOY_SMOKE_LOGIN_2026-10-13T0200.txt`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`