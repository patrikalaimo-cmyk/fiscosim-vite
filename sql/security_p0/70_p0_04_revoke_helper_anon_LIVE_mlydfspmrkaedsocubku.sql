-- SG-P0-04 LIVE: revoke anon EXECUTE on RLS helpers after class E hotfix
BEGIN;

REVOKE ALL ON FUNCTION public.current_utente_ruolo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_or_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_societa_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_access_scoped_row(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_utente_studio_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_utente_ruolo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_societa_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_scoped_row(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_utente_studio_id() TO authenticated, service_role;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_proc f
  JOIN pg_namespace n ON n.oid = f.pronamespace
  WHERE n.nspname = 'public'
    AND f.proname IN (
      'current_utente_ruolo','is_owner_or_admin','user_has_societa_access',
      'user_can_access_scoped_row','current_utente_studio_id'
    )
    AND f.prosecdef
    AND has_function_privilege('anon', f.oid, 'EXECUTE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'helper anon EXECUTE still present: %', bad;
  END IF;
END
$v$;

COMMIT;
