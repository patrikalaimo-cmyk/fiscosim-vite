-- FiscoSim P0 Stage 3A: company-scope RLS for four fiscal tables.
-- ONLY isolated local P0 Docker clone. NEVER execute on live.
-- Scope: corrispettivi_giornalieri, intrastat_operazioni,
-- liquidazioni_iva_societa, ritenute_dacconto.
-- This patch removes "Accesso autenticati" true policies, and creates
-- user_has_societa_access(societa_id) policies for the first three.
-- Ritenute already has scoped policy; only its bypass is removed.
-- This does not guarantee cross-studio isolation for Owner/Admin or
-- certify full app compatibility; separate tenant + E2E tests required.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  t text;
  n integer;
BEGIN
  IF current_setting('fiscosim.p0_stage3a_approval',true)
     IS DISTINCT FROM 'isolated-local-p0-only' THEN
    RAISE EXCEPTION 'stage3a missing local-test approval';
  END IF;
  IF to_regprocedure('public.user_has_societa_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing expected user_has_societa_access(uuid) helper';
  END IF;
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public'
    AND p.proname IN ('current_utente_ruolo','current_utente_studio_id')
    AND p.prosecdef
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND has_function_privilege('authenticated',p.oid,'EXECUTE');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Stage3a requires two hardened role helper functions; found %',n;
  END IF;
  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='v'
    AND (has_table_privilege('anon',c.oid,'SELECT') OR
         has_table_privilege('authenticated',c.oid,'SELECT') OR
         NOT EXISTS(SELECT 1 FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name='security_invoker' AND o.option_value='true'));
  IF n <> 0 THEN RAISE EXCEPTION 'Stage 2 view guard failed: %', n; END IF;
  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION 'Stage 2 RLS guard failed: %', n; END IF;
  FOREACH t IN ARRAY ARRAY['corrispettivi_giornalieri','intrastat_operazioni',
    'liquidazioni_iva_societa','ritenute_dacconto']::text[] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Missing expected public table: %', t;
    END IF;
    SELECT count(*) INTO n
      FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND policyname='Accesso autenticati'
        AND cmd='ALL'
        AND roles=ARRAY['authenticated']::name[]
        AND lower(btrim(qual))='true'
        AND lower(btrim(with_check))='true';
    IF n <> 1 THEN
      RAISE EXCEPTION 'Stage3a policy baseline mismatch: % (% policies)', t, n;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename=t
         AND policyname='p0_societa_member_all_lab_only') THEN
      RAISE EXCEPTION 'Stage3a already applied to %',t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns
        ON ns.oid=c.relnamespace
        WHERE ns.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'RLS disabled on %',t;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
    AND tablename='ritenute_dacconto'
    AND policyname='societa_scoped_ritenute_dacconto'
    AND cmd='ALL'
    AND qual='user_has_societa_access(societa_id)'
    AND with_check='user_has_societa_access(societa_id)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected existing ritenute societa policy absent';
  END IF;
END
$guard$;

-- Remove direct anonymous grants, defense in depth.
REVOKE ALL PRIVILEGES ON TABLE
  public.corrispettivi_giornalieri,
  public.intrastat_operazioni,
  public.liquidazioni_iva_societa,
  public.ritenute_dacconto
FROM anon;

-- Remove only exact broad policies checked by guard.
DROP POLICY "Accesso autenticati" ON public.corrispettivi_giornalieri;
DROP POLICY "Accesso autenticati" ON public.intrastat_operazioni;
DROP POLICY "Accesso autenticati" ON public.liquidazioni_iva_societa;
DROP POLICY "Accesso autenticati" ON public.ritenute_dacconto;

-- LAB candidate policy: company membership for reading and writing.
-- Actual RBAC for edit/close/lock remains to design and test separately.
CREATE POLICY p0_societa_member_all_lab_only ON public.corrispettivi_giornalieri
 FOR ALL TO authenticated
 USING (public.user_has_societa_access(societa_id))
 WITH CHECK (public.user_has_societa_access(societa_id));
CREATE POLICY p0_societa_member_all_lab_only ON public.intrastat_operazioni
 FOR ALL TO authenticated
 USING (public.user_has_societa_access(societa_id))
 WITH CHECK (public.user_has_societa_access(societa_id));
CREATE POLICY p0_societa_member_all_lab_only ON public.liquidazioni_iva_societa
 FOR ALL TO authenticated
 USING (public.user_has_societa_access(societa_id))
 WITH CHECK (public.user_has_societa_access(societa_id));

DO $verify$
DECLARE
  t text;
  n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['corrispettivi_giornalieri','intrastat_operazioni',
     'liquidazioni_iva_societa','ritenute_dacconto']::text[] LOOP
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
      AND tablename=t AND (lower(btrim(coalesce(qual,'')))='true' OR
      lower(btrim(coalesce(with_check,'')))='true');
    IF n <> 0 THEN RAISE EXCEPTION 'Broad policy still remains: %',t; END IF;
    IF has_table_privilege('anon','public.' || t,'SELECT') OR
       has_table_privilege('anon','public.' || t,'INSERT') OR
       has_table_privilege('anon','public.' || t,'UPDATE') OR
       has_table_privilege('anon','public.' || t,'DELETE') THEN
      RAISE EXCEPTION 'Anon table grants still remain: %',t;
    END IF;
  END LOOP;
END
$verify$;
COMMIT;
