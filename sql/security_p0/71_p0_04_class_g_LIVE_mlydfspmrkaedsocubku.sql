-- SG-P0-04 LIVE class G — close residual TRUE policies (2026-10-13)
BEGIN;

-- 1) Tables with societa_id: ensure tenant policy, then drop TRUE policies
DO $body$
DECLARE
  t text;
  has_soc boolean;
  has_scoped boolean;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'coda_import_fatture',
    'fatture_xml',
    'invii_log',
    'corrispettivi_giornalieri',
    'intrastat_operazioni',
    'liquidazioni_iva_societa',
    'revisioni_dichiarativi'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'skip missing %', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'societa_id'
    ) INTO has_soc;

    SELECT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t
        AND lower(btrim(coalesce(p.qual, ''))) <> 'true'
        AND lower(btrim(coalesce(p.with_check, ''))) <> 'true'
    ) INTO has_scoped;

    IF has_soc AND NOT has_scoped THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.user_has_societa_access(societa_id)) WITH CHECK (public.user_has_societa_access(societa_id))',
        t || '_tenant_membership',
        t
      );
      has_scoped := true;
      RAISE NOTICE 'created tenant policy on %', t;
    ELSIF NOT has_soc AND NOT has_scoped THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
        t || '_authenticated_uid',
        t
      );
      has_scoped := true;
      RAISE NOTICE 'created uid policy on % (no societa_id)', t;
    END IF;

    IF has_scoped THEN
      FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND (
            lower(btrim(coalesce(qual, ''))) = 'true'
            OR lower(btrim(coalesce(with_check, ''))) = 'true'
          )
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        RAISE NOTICE 'dropped TRUE policy % on %', r.policyname, t;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'cannot harden %: no societa_id and no scoped twin', t;
    END IF;
  END LOOP;
END
$body$;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (lower(btrim(coalesce(qual, ''))) = 'true' OR lower(btrim(coalesce(with_check, ''))) = 'true')
    AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['authenticated']::name[]);
  IF bad > 0 THEN
    RAISE EXCEPTION 'class G incomplete: % TRUE policies remain', bad;
  END IF;
END
$v$;

COMMIT;
