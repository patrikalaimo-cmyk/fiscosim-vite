# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Sviluppo residuale A100 **senza** collaudi manuali (operatore: sessione finale). Prod fiscosim-v6 OK; LIVE P0-04 broad TRUE=0. Import storico (#4/#7) già LAB.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Limite sviluppo:** Stampe/fascicolo; Manuale PATH multi2210+; Bank L5 memory DB; Hobby API; tenant `invii_log`/`revisioni`. Collaudi form = fine.

## 2. Prossimo passo operativo (verso A100)
1. Continuare sviluppo automatizzabile (Manuale multi-aliquota PATH, Stampe/UX, Bank L5, API Hobby se ≤12)
2. Sessione collaudi manuali **a fine sviluppo** (`FISCOSIM_MANUAL_TEST_DEBT.md` + `A100_OPERATOR_MANUAL_SESSION_GUIDE.md`)
3. Solo dopo collaudi verdi: dichiarare A100 / Bank live

## 3. Evidenze
* `REPORT/LIVE_DEPLOY_SMOKE_POST_CLASS_G_2026-10-13T0226.txt`
* `REPORT/STAGE3W_IMPORT_STORICO_MARKER_*` / `STAGE3W_IMPORT_07_STUDIO_VS_STORICO_*` (storico Import)
* `REPORT/A100_OPERATOR_MANUAL_SESSION_GUIDE.md`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`