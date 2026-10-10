-- FiscoSim P0 Stage3D: LAB ONLY, never deploy to production.
-- Remove six legacy TRUE-policy overrides; preserve four scoped role policies
-- per table. Existing role filters are NOT sufficient for multi-studio tenancy.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
DECLARE v record; n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3d_approval',true)
    IS DISTINCT FROM 'local-six-role-gates-only' THEN
   RAISE EXCEPTION 'Stage3D local-only approval required';
 END IF;
 SELECT count(*) INTO n FROM pg_policies
 WHERE schemaname='public' AND tablename='user_roles'
 AND policyname IN ('p0_user_roles_self_owner_select_lab_only',
                    'p0_user_roles_owner_manage_lab_only');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C is not installed'; END IF;
 FOR v IN SELECT * FROM (VALUES
  ('adempimenti_clienti','allow_all_adempimenti_clienti'),
  ('adempimenti_template','allow_all_adempimenti'),
  ('deleghe_uniche','allow_all_deleghe'),
  ('impostazioni_studio','allow_all'),
  ('invii_schedulati','allow_all_invii'),
  ('richieste_fatture','allow_all_richieste_fatture')
 ) AS x(tab,policy) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c
    JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public'
    AND c.relname=v.tab AND c.relkind='r' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'Stage3D missing RLS table %',v.tab;
  END IF;
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=v.tab
      AND policyname=v.policy AND cmd='ALL'
      AND roles=ARRAY['public']::name[]
      AND lower(btrim(qual))='true'
      AND lower(btrim(with_check))='true';
  IF n<>1 THEN RAISE EXCEPTION 'Stage3D bypass drift %',v.tab; END IF;
  SELECT count(DISTINCT cmd) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=v.tab
    AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')
    AND roles=ARRAY['public']::name[]
    AND ((cmd='INSERT' AND nullif(btrim(with_check),'') IS NOT NULL
         AND lower(btrim(with_check))<>'true')
      OR (cmd<>'INSERT' AND nullif(btrim(qual),'') IS NOT NULL
          AND lower(btrim(qual))<>'true'));
  IF n<>4 THEN RAISE EXCEPTION 'Stage3D missing scoped policies % (% of 4)',v.tab,n; END IF;
  IF has_table_privilege('anon','public.'||v.tab,'SELECT') THEN
   RAISE EXCEPTION 'Stage1 anon SELECT grant remains %',v.tab;
  END IF;
 END LOOP;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='impostazioni_studio'
     AND policyname='allow_all_impostazioni' AND cmd='ALL'
     AND roles=ARRAY['public']::name[]
     AND lower(btrim(qual))='true' AND lower(btrim(with_check))='true';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3D second settings bypass drift'; END IF;
END $gate$;
DROP POLICY allow_all_adempimenti_clienti ON public.adempimenti_clienti;
DROP POLICY allow_all_adempimenti ON public.adempimenti_template;
DROP POLICY allow_all_deleghe ON public.deleghe_uniche;
DROP POLICY allow_all ON public.impostazioni_studio;
DROP POLICY allow_all_impostazioni ON public.impostazioni_studio;
DROP POLICY allow_all_invii ON public.invii_schedulati;
DROP POLICY allow_all_richieste_fatture ON public.richieste_fatture;
DO $assert$
DECLARE t text; n integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['adempimenti_clienti','adempimenti_template',
 'deleghe_uniche','impostazioni_studio','invii_schedulati','richieste_fatture'] LOOP
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename=t
   AND (lower(btrim(coalesce(qual,'')))='true'
       OR lower(btrim(coalesce(with_check,'')))='true');
  IF n<>0 THEN RAISE EXCEPTION 'Stage3D TRUE policy remains %',t; END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=t
    AND cmd IN ('SELECT','INSERT','UPDATE','DELETE');
  IF n<>4 THEN RAISE EXCEPTION 'Stage3D unexpected remaining policies %',t; END IF;
 END LOOP;
END $assert$;
COMMIT;
