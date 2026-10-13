# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Prod **fiscosim-v6** live (`https://fiscosim-v6.vercel.app`); login operatore OK. LIVE P0-04 T1+T2 su `mlydfspmrkaedsocubku`. A100 ancora bloccata da collaudi manuali + 31 policy allow_all.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session` only)
* **Limite:** policy allow_all; Import #11; form Manuale/IVA/Consultazione; Stage3W API Hobby

## 2. Prossimo passo operativo (verso A100)
1. ~~Smoke LIVE post-tranche2~~ OK
2. ~~Deploy fiscosim-v6 + login~~ OK (`REPORT/LIVE_DEPLOY_SMOKE_LOGIN_2026-10-13T0200.txt`)
3. Collaudi manuali residui in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md` (Import #11, Manuale/IVA/Consultazione)
4. Redesign RLS tenant per rimuovere allow_all (blocco qualità A100 sicurezza)

## 3. Evidenze
* `REPORT/LIVE_DEPLOY_SMOKE_LOGIN_2026-10-13T0200.txt`
* `REPORT/LIVE_P0_04_TRANCHE2_APPLY_2026-10-12T2340.txt`
* `REPORT/LIVE_P0_04_CONTAINMENT_APPLY_2026-10-12T2331.txt`