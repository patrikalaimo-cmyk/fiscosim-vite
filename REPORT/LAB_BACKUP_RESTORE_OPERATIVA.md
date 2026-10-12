# LAB P0 — Backup / Restore operativo (SG-P4-06)

**Scope:** solo stack `FiscoSim-P0-LAB-20261008-164658` (Kong `127.0.0.1:55321`, PG `127.0.0.1:55322`).  
**Mai** toccare `fiscosim-local` / porte `54321`.

## Backup (eseguito in SG-P0-00)

Script: `scripts/security_p0/run-sg-p0-00-loopback-rebind.mjs`

1. `pg_dump -Fc` → `p0lab.dump` (via `docker exec` + `docker cp`)
2. Tar volume read-only → `supabase_db_volume.tgz`
3. Destinazione tipica: `%USERPROFILE%\FiscoSim-P0-LAB-BACKUP-<stamp>\`

Evidenza: `REPORT/STAGE3W_SG_P0_00_LOOPBACK_20261012130553.txt`  
Backup noto: `C:\Users\patri\FiscoSim-P0-LAB-BACKUP-20261012130159\`

## Restore (procedura manuale, non automatica)

1. Fermare container DB LAB (senza `-v`).
2. Ripristinare volume da tar **oppure** `pg_restore` del dump su DB vuoto — scegliere **uno** dei due percorsi, non entrambi alla cieca.
3. Riavviare Kong/Auth/Rest; verificare Stage3V: `node scripts/security_p0/verify-sg-p0-00-loopback.mjs`
4. Se Kong manca `/home/kong` (crt/key/yml), lo script di rebind ora ne fa snapshot/restore automatico.

## Verifica post-restore

- Volume `supabase_db_FiscoSim-P0-LAB-20261008-164658` presente
- Porte solo `127.0.0.1`
- RPC Stage3U + Stage3W presenti
- Smoke: `node scripts/security_p0/run-stage3w-l6-lab-regression.mjs` (pack L6)

## Documentazione studio (operativa)

- Roadmap: `REPORT/ROADMAP_COMPLETAMENTO_STUDIO_GRADE.md`
- Matrice: `REPORT/MATRICE_TEST_CONTABILI_E2E.md`
- Stato: `AI_WORKING_AREA_FISCOSIM/PROJECT_STATE.md`
