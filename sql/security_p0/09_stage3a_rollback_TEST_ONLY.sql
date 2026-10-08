-- UNSAFE RESTORATION of pre-Stage3A privileges and policies for LAB ONLY.
-- Never execute on live. Do not use as a production rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3a_rollback_approval',true)
   IS DISTINCT FROM 'local-test-rollback-only' THEN
    RAISE EXCEPTION 'Stage3a rollback denied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='corrispettivi_giornalieri'
    AND policyname='p0_societa_member_all_LAB_ONLY') THEN
    RAISE EXCEPTION 'Expected stage3a missing';
 END IF;
END $guard$;
DROP POLICY p0_societa_member_all_LAB_ONLY ON public.corrispettivi_giornalieri;
DROP POLICY p0_societa_member_all_LAB_ONLY ON public.intrastat_operazioni;
DROP POLICY p0_societa_member_all_LAB_ONLY ON public.liquidazioni_iva_societa;
CREATE POLICY "Accesso autenticati" ON public.corrispettivi_giornalieri
 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Accesso autenticati" ON public.intrastat_operazioni
 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Accesso autenticati" ON public.liquidazioni_iva_societa
 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Accesso autenticati" ON public.ritenute_dacconto
 FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL PRIVILEGES ON TABLE public.corrispettivi_giornalieri,
 public.intrastat_operazioni,public.liquidazioni_iva_societa,
 public.ritenute_dacconto TO anon;
COMMIT;
