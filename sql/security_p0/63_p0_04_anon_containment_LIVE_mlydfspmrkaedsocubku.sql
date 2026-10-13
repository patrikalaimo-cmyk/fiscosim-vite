-- SG-P0-04 LIVE containment tranche 1 (authorized 2026-10-13)
-- Project ref: mlydfspmrkaedsocubku (Fiscosim v4p)
-- Scope ONLY:
--   1) REVOKE ALL ON core fiscal tables FROM anon
--   2) DROP POLICY anon_access_test ON public.avvisi_ade (if present)
-- Does NOT revoke authenticated. Does NOT alter SECURITY DEFINER RPC EXECUTE.
-- Idempotent.

DO $body$
DECLARE
  t text;
  tables text[] := ARRAY[
    'prima_nota',
    'prima_nota_righe',
    'registri_iva',
    'partitario',
    'ritenute_dacconto',
    'stampe_definitive',
    'audit_contabile',
    'societa',
    'piano_conti',
    'documenti_import',
    'documenti_contabilita',
    'liquidazioni_iva',
    'utenti_studio'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'avvisi_ade' AND pol.polname = 'anon_access_test'
  ) THEN
    EXECUTE 'DROP POLICY anon_access_test ON public.avvisi_ade';
  END IF;
END
$body$;

DO $verify$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM information_schema.role_table_grants
  WHERE grantee = 'anon'
    AND table_schema = 'public'
    AND table_name IN (
      'prima_nota','prima_nota_righe','registri_iva','partitario',
      'ritenute_dacconto','stampe_definitive','audit_contabile',
      'societa','piano_conti','documenti_import','documenti_contabilita',
      'liquidazioni_iva','utenti_studio'
    )
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'P0-04 LIVE containment failed: anon still has % DML grants on core fiscal tables', bad;
  END IF;
END
$verify$;
