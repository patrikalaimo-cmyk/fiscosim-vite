# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Prod fiscosim-v6 live. LIVE P0-04 D→G: **BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC=0**. Anon containment OK. Contabilità smoke OK post-F; **re-smoke post-G** (Agenda/import/revisioni).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Limite:** collaudi manuali A100 (Import #11, form Manuale/IVA/Consultazione); Stage3W API Hobby

## 2. Prossimo passo operativo (verso A100)
1. ~~Smoke Contabilità post-F~~ OK (`LIVE_DEPLOY_SMOKE_CONTABILITA_POST_RLS_*`)
2. **Re-smoke post class G** (login + Prima Nota + Agenda/Adempimenti se usati)
3. Collaudi manuali residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`)
4. Opzionale: Pro/Hobby API Stage3W; tenant su `invii_log`/`revisioni` (oggi uid-only)

## 3. Evidenze
* `REPORT/LIVE_P0_04_CLASS_G_APPLY_2026-10-13T0025.txt` (broad 8→0)
* `REPORT/LIVE_DEPLOY_SMOKE_CONTABILITA_POST_RLS_2026-10-13T0224.txt`
* `REPORT/LIVE_P0_04_CLASS_F_APPLY_2026-10-13T0018.txt`
* `REPORT/LIVE_P0_04_CLASS_E_HOTFIX_2026-10-13T0018.txt`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`