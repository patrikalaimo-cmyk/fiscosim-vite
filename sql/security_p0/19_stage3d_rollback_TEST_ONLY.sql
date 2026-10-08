-- UNSAFE Stage3D rollback; restores broad TRUE policies in LOCAL LAB ONLY.
-- Never apply to production. Useful only to reset isolated QA clone.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3d_rollback_approval',true)
    IS DISTINCT FROM 'unsafe-local-rollback-only' THEN
  RAISE EXCEPTION 'Stage3D rollback denied: local approval missing';
 END IF;
 FOREACH t IN ARRAY ARRAY['adempimenti_clienti','adempimenti_template',
  'deleghe_uniche','impostazioni_studio','invii_schedulati',
  'richieste_fatture'] LOOP
  IF EXISTS(SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename=t
      AND (lower(btrim(coalesce(qual,'')))='true'
         OR lower(btrim(coalesce(with_check,'')))='true')) THEN
   RAISE EXCEPTION 'Stage3D expected fixed policies are already absent on %',t;
  END IF;
 END LOOP;
END $gate$;
CREATE POLICY allow_all_adempimenti_clienti ON public.adempimenti_clienti
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_adempimenti ON public.adempimenti_template
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_deleghe ON public.deleghe_uniche
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.impostazioni_studio
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_impostazioni ON public.impostazioni_studio
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_invii ON public.invii_schedulati
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_richieste_fatture ON public.richieste_fatture
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
COMMIT;
