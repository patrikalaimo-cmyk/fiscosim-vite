# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Sviluppo residuale A100 **senza** collaudi manuali (operatore: sessione finale). Prod fiscosim-v6 OK; LIVE P0-04 broad TRUE=0. L6CORE4 PASS; Manuale PATH #1–11+#13 LAB; Aging tab wired; Bank L5 DB memory.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Completamento A100 (stima 2026-10-13):** **~82%**
  * Automazione P0–P4 + Learning L0–L5: **~96%**
  * LIVE sicurezza + deploy: **~95%** (`invii_log` soft)
  * Debito collaudi form/visual: **~20%** (accantonato a fine; Import #11 + form Manuale/IVA/Bank)
* **Limite sviluppo:** Hobby session-only; `invii_log` senza `societa_id` (LIVE auth). Collaudi form = fine.

## 2. Prossimo passo operativo (verso A100)
1. Residui code opzionali sottili (Hobby API / Stampe UX / metriche L7) — altrimenti **sessione operatore**
2. Sessione collaudi manuali (`FISCOSIM_MANUAL_TEST_DEBT.md` + `A100_OPERATOR_MANUAL_SESSION_GUIDE.md`)
3. Solo dopo collaudi verdi: dichiarare A100 / Bank live
4. Tenant `invii_log`: migrazione + auth LIVE — non fare senza ok esplicito

## 3. Evidenze
* `REPORT/STAGE3W_MANUALE_FISCAL_PATH_*` (Manuale PATH fiscali + partitario parziale + periodo chiuso)
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261013080119.txt` (L6CORE4)
* `REPORT/LIVE_DEPLOY_SMOKE_POST_CLASS_G_2026-10-13T0226.txt`
* `REPORT/A100_OPERATOR_MANUAL_SESSION_GUIDE.md`
* `REPORT/P0_04_RLS_TENANT_REDESIGN_PLAN.md`