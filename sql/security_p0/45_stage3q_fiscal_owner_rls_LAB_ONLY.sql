-- FiscoSim P0 Stage3Q: candidate strict CRM and fiscal-row company ownership.
-- LAB ONLY. NOT APPROVED FOR EXECUTION. UI/API writes must be migrated first.
-- Tested target baseline: Stage3P installed empty CRM link; 0 customers/notices/revisions.
-- Existing RLS permissive policies are intersected with RESTRICTIVE policies,
-- not silently altered or dropped. No source rows are backfilled.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE name text;
BEGIN
 IF current_setting('fiscosim.p0_stage3q_approval',true)
   IS DISTINCT FROM 'local-explicit-fiscal-row-ownership-only' THEN
  RAISE EXCEPTION 'Stage3Q LAB approval missing';
 END IF;
 IF to_regclass('public.crm_cliente_societa_link') IS NULL THEN
  RAISE EXCEPTION 'Stage3Q requires completed Stage3P';
 END IF;
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>0
    OR (SELECT count(*) FROM public.clienti)<>0
    OR (SELECT count(*) FROM public.avvisi_ade)<>0
    OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'Stage3Q refuses source data: requires empty isolated LAB';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_cliente_societa_link') THEN
  RAISE EXCEPTION 'Stage3Q unexpected previously-open CRM link RLS';
 END IF;
 IF has_table_privilege('authenticated','public.crm_cliente_societa_link','SELECT') THEN
  RAISE EXCEPTION 'Stage3Q link was already browser-readable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p
   WHERE p.oid='public.user_can_access_cliente(uuid)'::regprocedure
   AND NOT p.prosecdef) THEN
  RAISE EXCEPTION 'Stage3Q customer helper must be SECURITY INVOKER';
 END IF;
 IF has_table_privilege('anon','public.avvisi_ade','SELECT')
    OR has_table_privilege('anon','public.revisioni_dichiarativi','SELECT')
    OR has_table_privilege('anon','public.clienti','SELECT') THEN
  RAISE EXCEPTION 'Stage3Q unexpected anonymous table-wide SELECT grant';
 END IF;
 FOREACH name IN ARRAY ARRAY['avvisi_ade','revisioni_dichiarativi'] LOOP
  IF EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid=format('public.%I',name)::regclass
   AND attname='societa_id' AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Stage3Q company column already present: %',name;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='clienti'
  AND policyname='clienti_modify_policy')
  OR NOT EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='avvisi_ade'
  AND policyname='full_access_authenticated')
  OR NOT EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='revisioni_dichiarativi'
  AND policyname='Accesso autenticati') THEN
  RAISE EXCEPTION 'Stage3Q unexpected fiscal baseline policies';
 END IF;
END $preflight$;

-- The link becomes SELECT-able only to authenticated users with a verified
-- company membership AND permission to that particular client.
-- This intentionally extends Stage3P's sealed foundation under strict RLS;
-- UPDATE/DELETE/INSERT stay service-only, no browser writes.
CREATE POLICY crm_link_authenticated_scoped_read
ON public.crm_cliente_societa_link
FOR SELECT TO authenticated
USING (
  public.user_has_societa_access(societa_id)
  AND EXISTS (
    SELECT 1 FROM public.utenti_studio us
    WHERE us.auth_user_id=auth.uid()
      AND us.attivo IS TRUE
      AND (
        us.ruolo IN ('owner','admin')
        OR coalesce((us.permessi->'clienti'->>'solo_assegnati')::boolean,false)=false
        OR cliente_id=ANY(coalesce(us.clienti_assegnati,'{}'::uuid[]))
      )
  )
);
GRANT SELECT ON TABLE public.crm_cliente_societa_link TO authenticated;

-- Replace only the unsafe globally-scoped helper. It still uses SECURITY
-- INVOKER (never definer); ownership derived solely from explicitly linked
-- company + membership + active staff + allowed client selection.
CREATE OR REPLACE FUNCTION public.user_can_access_cliente(target_cliente uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
 SELECT target_cliente IS NOT NULL AND auth.uid() IS NOT NULL
  AND EXISTS (
   SELECT 1
   FROM public.crm_cliente_societa_link link
   JOIN public.utenti_studio us
     ON us.auth_user_id=auth.uid() AND us.attivo IS TRUE
   WHERE link.cliente_id=target_cliente
     AND public.user_has_societa_access(link.societa_id)
     AND (
      us.ruolo IN ('owner','admin')
      OR coalesce((us.permessi->'clienti'->>'solo_assegnati')::boolean,false)=false
      OR target_cliente=ANY(coalesce(us.clienti_assegnati,'{}'::uuid[]))
     )
  );
$$;

-- Restrictive policies intersect every existing permissive policy (OR).
-- CRM customer profiles may be shared between companies; editing one from
-- browser A would change the SAME record seen by browser B. Therefore
-- block ALL direct browser CRM mutation until atomic, server-verified
-- create/edit/deactivate endpoints are implemented and JWT tested.
CREATE POLICY clienti_company_boundary
ON public.clienti AS RESTRICTIVE FOR ALL TO authenticated
USING (public.user_can_access_cliente(id))
WITH CHECK (public.user_can_access_cliente(id));

-- Preserve company-scoped reads but prohibit direct customer mutation from
-- any browser role. Service role is not modified. Column-grant leftovers
-- are treated as a hard failure rather than an implicit exception.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.clienti
 FROM authenticated, anon, PUBLIC;
DO $client_acl$
DECLARE col text; op text;
BEGIN
 FOR col IN SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clienti'
 LOOP
  FOREACH op IN ARRAY ARRAY['INSERT','UPDATE'] LOOP
   IF has_column_privilege('authenticated','public.clienti',col,op)
      OR has_column_privilege('anon','public.clienti',col,op) THEN
     RAISE EXCEPTION 'Stage3Q CRM browser column mutation remains: % %',col,op;
   END IF;
  END LOOP;
 END LOOP;
 FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
  IF has_table_privilege('authenticated','public.clienti',op)
    OR has_table_privilege('anon','public.clienti',op) THEN
   RAISE EXCEPTION 'Stage3Q CRM browser table mutation remains: %',op;
  END IF;
  IF NOT has_table_privilege('service_role','public.clienti',op) THEN
   RAISE EXCEPTION 'Stage3Q CRM service role privilege lost: %',op;
  END IF;
 END LOOP;
END $client_acl$;

-- Every fiscal row must have exactly one company scope, even if its CRM
-- customer is linked to two companies. A nullable client on declarations
-- is allowed for "without archiving"; the company remains mandatory.
ALTER TABLE public.avvisi_ade
 ADD COLUMN societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT;
ALTER TABLE public.revisioni_dichiarativi
 ADD COLUMN societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT;
ALTER TABLE public.avvisi_ade
 ADD CONSTRAINT avvisi_ade_crm_company_fk
 FOREIGN KEY (cliente_id,societa_id)
 REFERENCES public.crm_cliente_societa_link(cliente_id,societa_id) ON DELETE RESTRICT;
ALTER TABLE public.revisioni_dichiarativi
 ADD CONSTRAINT revisioni_dichiarativi_crm_company_fk
 FOREIGN KEY (cliente_id,societa_id)
 REFERENCES public.crm_cliente_societa_link(cliente_id,societa_id) ON DELETE RESTRICT;
-- AgeCon cannot be a nameless/unassigned fiscal notice.
ALTER TABLE public.avvisi_ade
 ADD CONSTRAINT avvisi_ade_cliente_required CHECK (cliente_id IS NOT NULL);

CREATE INDEX avvisi_ade_societa_idx ON public.avvisi_ade(societa_id);
CREATE INDEX revisioni_dichiarativi_societa_idx ON public.revisioni_dichiarativi(societa_id);

-- A restrict policy for ALL prevents unauthorized SELECT and UPDATE by id.
-- On INSERT/UPDATE the same predicate is enforced as WITH CHECK.
CREATE POLICY avvisi_ade_company_boundary
ON public.avvisi_ade AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.user_has_societa_access(societa_id)
  AND cliente_id IS NOT NULL
  AND public.user_can_access_cliente(cliente_id)
  AND EXISTS (
   SELECT 1 FROM public.crm_cliente_societa_link link
   WHERE link.cliente_id=avvisi_ade.cliente_id
    AND link.societa_id=avvisi_ade.societa_id
  )
)
WITH CHECK (
  public.user_has_societa_access(societa_id)
  AND cliente_id IS NOT NULL
  AND public.user_can_access_cliente(cliente_id)
  AND EXISTS (
   SELECT 1 FROM public.crm_cliente_societa_link link
   WHERE link.cliente_id=avvisi_ade.cliente_id
    AND link.societa_id=avvisi_ade.societa_id
  )
);

CREATE POLICY revisioni_company_boundary
ON public.revisioni_dichiarativi AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.user_has_societa_access(societa_id)
  AND (
    cliente_id IS NULL OR (
      public.user_can_access_cliente(cliente_id)
      AND EXISTS (
       SELECT 1 FROM public.crm_cliente_societa_link link
       WHERE link.cliente_id=revisioni_dichiarativi.cliente_id
        AND link.societa_id=revisioni_dichiarativi.societa_id
      )
    )
  )
)
WITH CHECK (
  public.user_has_societa_access(societa_id)
  AND (
    cliente_id IS NULL OR (
      public.user_can_access_cliente(cliente_id)
      AND EXISTS (
       SELECT 1 FROM public.crm_cliente_societa_link link
       WHERE link.cliente_id=revisioni_dichiarativi.cliente_id
        AND link.societa_id=revisioni_dichiarativi.societa_id
      )
    )
  )
);

-- Prevent silent fiscal owner change, even by authorized users who can
-- operate in both companies. Locked company ownership needs manual formal
-- reconciliation via an audited separate workflow in the future.
CREATE FUNCTION public.prevent_fiscal_societa_reassignment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.societa_id IS DISTINCT FROM OLD.societa_id THEN
  RAISE EXCEPTION 'Fiscal record company ownership is immutable';
 END IF;
 IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
  RAISE EXCEPTION 'Fiscal record customer ownership is immutable';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_fiscal_societa_reassignment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_avvisi_ade_company_immutable
 BEFORE UPDATE OF societa_id,cliente_id ON public.avvisi_ade
 FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_societa_reassignment();
CREATE TRIGGER trg_revisioni_company_immutable
 BEFORE UPDATE OF societa_id,cliente_id ON public.revisioni_dichiarativi
 FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_societa_reassignment();

DO $verify$
DECLARE tab text; expected text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['clienti','avvisi_ade','revisioni_dichiarativi'] LOOP
  SELECT CASE tab
   WHEN 'clienti' THEN 'clienti_company_boundary'
   WHEN 'avvisi_ade' THEN 'avvisi_ade_company_boundary'
   ELSE 'revisioni_company_boundary' END INTO expected;
  IF NOT EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename=tab
    AND policyname=expected AND permissive='RESTRICTIVE'
    AND cmd='ALL'
  ) THEN RAISE EXCEPTION 'Stage3Q restrictive policy missing: %',tab; END IF;
 END LOOP;
 IF NOT EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='crm_cliente_societa_link'
   AND policyname='crm_link_authenticated_scoped_read'
 ) THEN RAISE EXCEPTION 'Stage3Q linked SELECT policy missing'; END IF;
 IF NOT has_table_privilege('authenticated','public.crm_cliente_societa_link','SELECT')
   OR has_table_privilege('authenticated','public.crm_cliente_societa_link','INSERT')
   OR has_table_privilege('authenticated','public.crm_cliente_societa_link','UPDATE')
   OR has_table_privilege('authenticated','public.crm_cliente_societa_link','DELETE')
 THEN RAISE EXCEPTION 'Stage3Q CRM link browser ACL incorrect'; END IF;
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>0
    OR (SELECT count(*) FROM public.clienti)<>0
    OR (SELECT count(*) FROM public.avvisi_ade)<>0
    OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'Stage3Q unexpectedly changed source rows';
 END IF;
 IF public.user_can_access_cliente(NULL::uuid) THEN
  RAISE EXCEPTION 'Stage3Q null client must be denied';
 END IF;
END $verify$;
COMMIT;
