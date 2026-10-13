# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Sviluppo residuale automatizzabile **CHIUSO**. Prossimo: **sessione collaudi manuali** (`REPORT/A100_OPERATOR_MANUAL_SESSION_GUIDE.md`).
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **Deploy:** `dpl_Fov6bmt2yKiRQLCBumxiwGDLs8Yi` (SPA + `api/auth/session`)
* **Completamento A100 (stima 2026-10-13):** **~84%**
  * Automazione P0–P4 + Learning L0–L5 + Manuale PATH #1–13: **~97%**
  * LIVE sicurezza + deploy: **~95%** (`invii_log` soft)
  * Collaudi form/visual: **~20%** → sessione operatore ora
* **Fuori senza ok esplicito:** Hobby API oltre session; migrazione tenant `invii_log` LIVE.

## 2. Prossimo passo operativo (verso A100)
1. **Sessione collaudi** guidata (`A100_OPERATOR_MANUAL_SESSION_GUIDE.md` checklist A–F)
2. Fix bug/UX emersi → re-smoke mirato
3. Solo dopo collaudi verdi: dichiarare A100 / Bank live

## 3. Evidenze chiave
* `REPORT/STAGE3W_MANUALE_FISCAL_PATH_*` (fiscali + partitario + lock + payload blockers)
* `REPORT/STAGE3W_L6_REGRESSIONE_P4_02_20261013080119.txt` (L6CORE4)
* `REPORT/A100_OPERATOR_MANUAL_SESSION_GUIDE.md`
* `REPORT/LIVE_DEPLOY_SMOKE_POST_CLASS_G_2026-10-13T0226.txt`
