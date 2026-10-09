-- FiscoSim Stage3P-2: explicit CRM-client <-> accounting-company binding.
-- LAB ONLY. Foundation/schema ONLY: does NOT update the existing clienti,
-- avvisi_ade or revisioni_dichiarativi RLS, and does NOT backfill any row.
-- In particular this does not yet resolve the release-blocking cross-client exposure.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $guard$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3p_approval',true)
    IS DISTINCT FROM 'local-empty-crm-company-link-foundation' THEN
  RAISE EXCEPTION 'Stage3P explicit isolated LAB approval missing';
 END IF;
 FOREACH t IN ARRAY ARRAY['clienti','societa'] LOOP
  IF NOT EXISTS (
   SELECT 1 FROM pg_attribute a
   WHERE a.attrelid=format('public.%I',t)::regclass
     AND a.attname='id' AND a.atttypid='uuid'::regtype
     AND a.attnotnull AND NOT a.attisdropped
  ) THEN RAISE EXCEPTION 'Stage3P expected UUID PK absent: %',t; END IF;
 END LOOP;
 IF to_regclass('auth.users') IS NULL THEN
  RAISE EXCEPTION 'Stage3P requires local Auth schema';
 END IF;
 IF to_regclass('public.crm_cliente_societa_link') IS NOT NULL THEN
  RAISE EXCEPTION 'Stage3P CRM link already exists: inspect before rerun; no implicit ALTER';
 END IF;
END $guard$;

CREATE TABLE public.crm_cliente_societa_link (
 cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE RESTRICT,
 societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT,
 assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 decision_reason text NOT NULL
  CHECK (char_length(btrim(decision_reason)) BETWEEN 12 AND 500),
 PRIMARY KEY (cliente_id,societa_id)
);
COMMENT ON TABLE public.crm_cliente_societa_link IS
 'LAB ONLY Stage3P: manual verified CRM-accounting associations; no automatic backfill; no browser access. NOT a replacement for studio tenancy or child fiscal record ownership.';
CREATE INDEX crm_cliente_societa_societa_idx
 ON public.crm_cliente_societa_link(societa_id,cliente_id);
ALTER TABLE public.crm_cliente_societa_link ENABLE ROW LEVEL SECURITY;

-- No browser grant and NO permissive RLS policy. Even a valid JWT has no access.
REVOKE ALL PRIVILEGES ON TABLE public.crm_cliente_societa_link
 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT ON TABLE public.crm_cliente_societa_link TO service_role;

DO $verify$
DECLARE op text; col text;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_class
  WHERE oid='public.crm_cliente_societa_link'::regclass AND relrowsecurity
 ) OR EXISTS(
  SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_cliente_societa_link'
 ) THEN
  RAISE EXCEPTION 'Stage3P CRM binding RLS or policy invariant failed';
 END IF;
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
  RAISE EXCEPTION 'Stage3P new link must start empty';
 END IF;
 FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
  IF has_table_privilege('anon','public.crm_cliente_societa_link',op)
   OR has_table_privilege('authenticated','public.crm_cliente_societa_link',op) THEN
   RAISE EXCEPTION 'Stage3P browser privilege remains: %',op;
  END IF;
 END LOOP;
 FOR col IN SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='crm_cliente_societa_link'
 LOOP
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   IF has_column_privilege('anon','public.crm_cliente_societa_link',col,op)
    OR has_column_privilege('authenticated','public.crm_cliente_societa_link',col,op) THEN
    RAISE EXCEPTION 'Stage3P column-level browser privilege remains: % %',col,op;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.crm_cliente_societa_link','SELECT')
  OR NOT has_table_privilege('service_role','public.crm_cliente_societa_link','INSERT')
  OR has_table_privilege('service_role','public.crm_cliente_societa_link','UPDATE')
  OR has_table_privilege('service_role','public.crm_cliente_societa_link','DELETE') THEN
  RAISE EXCEPTION 'Stage3P server insert-only table privileges incorrect';
 END IF;
END $verify$;
COMMIT;
