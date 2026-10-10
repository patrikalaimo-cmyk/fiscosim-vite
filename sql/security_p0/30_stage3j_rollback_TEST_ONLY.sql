-- FiscoSim P0 Stage3J test-only unsafe rollback of legacy browser access.
-- LAB ONLY: intentionally restores the prior cross-studio access hazard.
-- This rollback restores only the four documented pre-Stage3J DML grants.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3j_rollback_approval',true)
   IS DISTINCT FROM 'unsafe-lab-restore-legacy-browser-dml' THEN
  RAISE EXCEPTION 'Stage3J dangerous rollback requires explicit LAB approval';
 END IF;
 FOREACH t IN ARRAY ARRAY[
  'studios','users','clients','f24_scadenze','f24_righe','liquidazioni_iva'
 ] LOOP
  IF has_table_privilege('authenticated',format('public.%I',t),'SELECT')
   OR has_table_privilege('authenticated',format('public.%I',t),'INSERT')
   OR has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
   OR has_table_privilege('authenticated',format('public.%I',t),'DELETE') THEN
   RAISE EXCEPTION 'Stage3J not quarantined or baseline changed: %',t;
  END IF;
 END LOOP;
END $gate$;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 public.studios, public.users, public.clients,
 public.f24_scadenze, public.f24_righe, public.liquidazioni_iva
 TO authenticated;
COMMIT;
