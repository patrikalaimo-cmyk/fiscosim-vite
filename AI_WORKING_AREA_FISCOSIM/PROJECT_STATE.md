# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Prod **fiscosim-v6** live; login OK. LIVE anon containment OK; **31** policy `true` auth/public restano. LAB: L6 PASS; Manuale #1 giroconto PATH; class D test_* allow_all droppati su LAB only.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Limite:** LIVE RLS tenant redesign; Import #11; form Manuale/IVA/Consultazione; Stage3W API Hobby

## 2. Prossimo passo operativo (verso A100)
1. ~~Smoke + deploy login~~ OK
2. Collaudi manuali residui (`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`)
3. Redesign RLS tenant LIVE (piano `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`) — **serve autorizzazione** per apply LIVE (classe D test_* già LAB)
4. Opzionale: Pro/Hobby API Stage3W

## 3. Evidenze
* `REPORT/LIVE_DEPLOY_SMOKE_LOGIN_2026-10-13T0200.txt`
* `REPORT/LIVE_P0_READONLY_AUDIT_2026-10-13T0004.txt` (`BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC=31`)
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261013000521.txt`
* `REPORT/STAGE3W_L4_BROWSER_MANUALE_giroconto_2026-10-13T0004.txt`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`