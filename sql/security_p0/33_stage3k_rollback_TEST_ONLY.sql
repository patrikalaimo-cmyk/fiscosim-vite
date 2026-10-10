-- FiscoSim P0 Stage 3K UNSAFE rollback to pre-Stage3K legacy helper.
-- LAB ONLY. Restores owner/admin GLOBAL access to every company;
-- NEVER deploy to production and never run except explicit rollback exercise.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3k_rollback_approval',true)
    IS DISTINCT FROM 'unsafe-lab-restore-global-company-fallback' THEN
  RAISE EXCEPTION 'Stage3K unsafe rollback not approved';
 END IF;
 IF to_regprocedure('public.user_has_societa_access(uuid)') IS NULL
  OR pg_get_functiondef('public.user_has_societa_access(uuid)'::regprocedure)
    !~ 'uss[.]auth_user_id[[:space:]]*=[[:space:]]*requester' THEN
  RAISE EXCEPTION 'Stage3K safe function not installed: abort rollback';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.user_has_societa_access(target_societa uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $function$
DECLARE
  user_role text;
BEGIN
  IF auth.uid() IS NULL OR target_societa IS NULL THEN
    RETURN false;
  END IF;

  user_role := public.current_utente_ruolo();
  IF user_role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.utenti_studio_societa uss
    JOIN public.utenti_studio us ON us.id = uss.utente_id
    WHERE uss.societa_id = target_societa
      AND us.attivo = true
      AND (uss.auth_user_id = auth.uid()
           OR us.auth_user_id = auth.uid())
  );
END;
$function$;
COMMIT;
