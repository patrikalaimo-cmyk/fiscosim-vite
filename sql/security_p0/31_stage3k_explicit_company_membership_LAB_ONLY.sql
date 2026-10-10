-- FiscoSim P0 Stage 3K — remove owner/admin automatic cross-company access.
-- Applies ONLY to isolated Docker P0 lab, never live / production.
-- Existing company memberships are NOT modified or backfilled.
-- Owner/Admin without explicit public.utenti_studio_societa membership
-- intentionally lose company data access (fail closed).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $gate$
DECLARE
 f oid;
 body text;
BEGIN
 IF current_setting('fiscosim.p0_stage3k_approval',true)
   IS DISTINCT FROM 'local-explicit-company-memberships-only' THEN
  RAISE EXCEPTION 'Stage3K explicit isolated LAB approval is missing';
 END IF;
 SELECT p.oid, pg_get_functiondef(p.oid) INTO f,body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='user_has_societa_access'
   AND pg_get_function_identity_arguments(p.oid)='target_societa uuid';
 IF f IS NULL THEN
  RAISE EXCEPTION 'Stage3K expected company access function missing';
 END IF;
 IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=f) THEN
  RAISE EXCEPTION 'Stage3K refuses SECURITY DEFINER company helper';
 END IF;
 IF body !~* 'user_role[[:space:]]+in[[:space:]]*[(][[:space:]]*''owner'''
   OR body !~* 'return[[:space:]]+true'
   OR body !~* 'public[.]utenti_studio_societa' THEN
  RAISE EXCEPTION 'Stage3K unexpected global fallback baseline';
 END IF;
 IF NOT has_function_privilege('authenticated',f,'EXECUTE') THEN
  RAISE EXCEPTION 'Stage3K authenticated helper execute privilege missing';
 END IF;
 IF has_table_privilege('authenticated','public.f24_scadenze','SELECT')
   OR has_table_privilege('authenticated','public.liquidazioni_iva','SELECT') THEN
  RAISE EXCEPTION 'Stage3K requires Stage3J legacy quarantine';
 END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.user_has_societa_access(target_societa uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  requester uuid := auth.uid();
BEGIN
  IF requester IS NULL OR target_societa IS NULL THEN
    RETURN false;
  END IF;

  -- Never authorize by a global studio role alone.
  -- Both membership/auth links must refer to the active caller.
  RETURN EXISTS (
    SELECT 1 FROM public.utenti_studio_societa uss
    JOIN public.utenti_studio us ON us.id = uss.utente_id
    WHERE uss.societa_id = target_societa
      AND us.attivo IS TRUE
      AND us.auth_user_id = requester
      AND uss.auth_user_id = requester
  );
END;
$function$;

DO $verify$
DECLARE f oid; body text;
BEGIN
 SELECT p.oid, pg_get_functiondef(p.oid) INTO f,body
 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname='user_has_societa_access'
   AND pg_get_function_identity_arguments(p.oid)='target_societa uuid';
 IF f IS NULL OR body !~* 'uss[.]auth_user_id[[:space:]]*=[[:space:]]*requester'
  OR body !~* 'us[.]auth_user_id[[:space:]]*=[[:space:]]*requester'
  OR body ~* 'user_role[[:space:]]+in[[:space:]]*[(][[:space:]]*''owner'''
  OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=f)
  OR NOT has_function_privilege('authenticated',f,'EXECUTE')
 THEN
  RAISE EXCEPTION 'Stage3K explicit-membership function verification failed';
 END IF;
 IF public.user_has_societa_access(NULL::uuid) THEN
  RAISE EXCEPTION 'Stage3K helper must deny NULL company';
 END IF;
END $verify$;
COMMIT;
