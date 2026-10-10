-- P0 LAB-ONLY helper authorization test; no rows inserted.
-- Validate unknown authenticated identity does not trigger recursive policies.
BEGIN;
SET LOCAL statement_timeout='12s';
DO $guard$ BEGIN
 IF current_setting('fiscosim.p0_helper_test_approval',true)
    IS DISTINCT FROM 'p0-local-rls-fixtures-only' THEN
   RAISE EXCEPTION 'P0 helper test authorization missing';
 END IF;
END $guard$;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='20000000-0000-4000-8000-000000000999';
SET LOCAL "request.jwt.claim.role"='authenticated';
DO $test$
BEGIN
 IF public.current_utente_ruolo() IS DISTINCT FROM 'collaboratore' THEN
   RAISE EXCEPTION 'Role lookup for nonexistent user failed';
 END IF;
 IF public.current_utente_studio_id() IS NOT NULL THEN
   RAISE EXCEPTION 'Studio identity leaked to nonexistent user';
 END IF;
 IF public.user_has_societa_access('20000000-0000-4000-8000-000000000101') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: unaffiliated user has societa access';
 END IF;
 IF (SELECT count(*) FROM public.utenti_studio) <> 0 THEN
   RAISE EXCEPTION 'SECURITY FAILURE: unaffiliated user sees studio staff';
 END IF;
 RAISE NOTICE 'PASS: no recursive auth lookup; unaffiliated role/studio denied';
END $test$;
ROLLBACK;
