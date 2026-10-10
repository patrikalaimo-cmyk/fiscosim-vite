-- RESTORES PRE-FIX INSECURE FUNCTIONS, TEST ONLY (not production).
BEGIN;
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_helper_rollback_approval',true)
 IS DISTINCT FROM 'p0-lab-rollback-only' THEN
   RAISE EXCEPTION 'helper rollback denied outside local QA';
 END IF;
END $guard$;
ALTER FUNCTION public.current_utente_ruolo() SECURITY INVOKER;
ALTER FUNCTION public.current_utente_ruolo() RESET search_path;
GRANT EXECUTE ON FUNCTION public.current_utente_ruolo() TO PUBLIC, anon;
ALTER FUNCTION public.current_utente_studio_id() SECURITY INVOKER;
ALTER FUNCTION public.current_utente_studio_id() RESET search_path;
GRANT EXECUTE ON FUNCTION public.current_utente_studio_id() TO PUBLIC, anon;
COMMIT;
