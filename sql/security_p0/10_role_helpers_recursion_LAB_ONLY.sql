-- FiscoSim P0 LAB-ONLY prerequisite to stage 3A: remove RLS role lookup recursion.
-- The two zero-arg helpers select ONLY the currently authenticated user's
-- active studio row. No client-controlled identity parameter is accepted.
-- Postgres-owner SECURITY DEFINER avoids recursion in utenti_studio policies.
-- NEVER execute against production without rollback + auth E2E approval.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE fn text;
DECLARE n integer;
BEGIN
  IF current_setting('fiscosim.p0_helper_fix_approval',true)
     IS DISTINCT FROM 'p0-local-only-rls-recursion' THEN
    RAISE EXCEPTION 'P0 helper fix missing local test approval';
  END IF;
  FOREACH fn IN ARRAY ARRAY['current_utente_ruolo','current_utente_studio_id']::text[] LOOP
    SELECT count(*) INTO n FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname=fn
      AND pg_get_function_identity_arguments(p.oid)=''
      AND NOT p.prosecdef
      AND p.proowner::regrole::text='postgres';
    IF n <> 1 THEN
      RAISE EXCEPTION 'P0 helper baseline mismatch: %',fn;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
    AND tablename='utenti_studio'
    AND policyname='utenti_studio_self_or_owner_select'
    AND qual LIKE '%is_owner_or_admin()%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'P0 utenti_studio owner/self-policy baseline mismatch';
  END IF;
END $guard$;

ALTER FUNCTION public.current_utente_ruolo() SECURITY DEFINER;
ALTER FUNCTION public.current_utente_ruolo() SET search_path = pg_catalog, public, auth;
REVOKE EXECUTE ON FUNCTION public.current_utente_ruolo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_utente_ruolo() TO authenticated, service_role;

ALTER FUNCTION public.current_utente_studio_id() SECURITY DEFINER;
ALTER FUNCTION public.current_utente_studio_id() SET search_path = pg_catalog, public, auth;
REVOKE EXECUTE ON FUNCTION public.current_utente_studio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_utente_studio_id() TO authenticated, service_role;

DO $assert$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['current_utente_ruolo','current_utente_studio_id']::text[] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||fn||'()')
        AND p.prosecdef AND p.proowner::regrole::text='postgres'
        AND p.proconfig @> ARRAY['search_path=pg_catalog, public, auth']::text[]) THEN
      RAISE EXCEPTION 'Helper privilege/search_path assertion failed for %',fn;
    END IF;
    IF has_function_privilege('anon','public.'||fn||'()','EXECUTE') OR
       NOT has_function_privilege('authenticated','public.'||fn||'()','EXECUTE') THEN
      RAISE EXCEPTION 'Helper ACL assertion failed for %',fn;
    END IF;
  END LOOP;
END $assert$;
COMMIT;
