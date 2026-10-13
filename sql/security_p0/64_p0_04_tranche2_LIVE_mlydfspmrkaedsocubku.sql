-- SG-P0-04 LIVE tranche 2 — generated; authorized 2026-10-13
BEGIN;
DO $body$
DECLARE
  r record;
  t text;
BEGIN
  -- 1) SECURITY DEFINER: revoke anon/PUBLIC execute; grant authenticated+service_role
  FOR r IN
    SELECT f.oid, f.oid::regprocedure AS regproc
    FROM pg_proc f
    JOIN pg_namespace n ON n.oid=f.pronamespace
    WHERE n.nspname='public' AND f.prosecdef
      AND has_function_privilege('anon', f.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.regproc);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.regproc);
  END LOOP;

  -- 2) Revoke any remaining anon privileges on public tables/views
  FOR t IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v')
      AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;

  -- 3) Drop policies that target ONLY anon (safe; does not remove authenticated allow_all)
  FOR r IN
    SELECT c.relname AS tablename, p.polname AS policyname
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname='anon')]::oid[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END
$body$;
-- verify definer anon execute = 0
DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM pg_proc f
  JOIN pg_namespace n ON n.oid=f.pronamespace
  WHERE n.nspname='public' AND f.prosecdef
    AND has_function_privilege('anon', f.oid, 'EXECUTE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'tranche2 failed: % SECURITY DEFINER still executable by anon', bad;
  END IF;
END
$v$;
COMMIT;
