# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** LIVE P0-04 tranche 1 **APPLICATA** su Fiscosim v4p (`mlydfspmrkaedsocubku`): anon DML core = 0. Dump locale presente. Residui: 8 RPC SECURITY DEFINER anon + policy broad non-core.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** `d8b8011`
* **Limite:** seconda tranche LIVE (RPC/policy) solo con nuova autorizzazione; collaudi browser A100

## 2. Prossimo passo operativo
1. Opzionale: autorizzare tranche 2 (REVOKE EXECUTE anon su RPC SECURITY DEFINER / policy broad)
2. Collaudi manuali residui (Import #11, form Manuale/IVA)
3. Continuare LAB se utile

## 3. Evidenze
* `REPORT/LIVE_P0_04_CONTAINMENT_APPLY_2026-10-12T2331.txt`
* `REPORT/LIVE_P0_READONLY_AUDIT_2026-10-12T2327.txt`
* `REPORT/LIVE_BACKUP_schema_public_20261013.sql` (locale, gitignored)