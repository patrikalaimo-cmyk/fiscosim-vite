-- INSECURE TEST-ONLY ROLLBACK. Restore observed live baseline in lab.
-- NEVER RUN AGAINST PRODUCTION.
BEGIN;
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3c_rollback_approval',true)
   IS DISTINCT FROM 'unsafe-lab-rollback-only' THEN
  RAISE EXCEPTION 'Stage3C rollback blocked outside lab';
 END IF;
END $guard$;
DROP POLICY p0_user_roles_self_owner_select_lab_only ON public.user_roles;
DROP POLICY p0_user_roles_owner_manage_lab_only ON public.user_roles;
CREATE POLICY "Lettura autenticati" ON public.user_roles
 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestione solo owner" ON public.user_roles
 FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id=auth.uid() AND ur.role='owner'))
 WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id=auth.uid() AND ur.role='owner'));
CREATE POLICY public_access ON public.utenti_studio
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
GRANT ALL PRIVILEGES ON TABLE public.utenti_studio,public.user_roles TO anon;
COMMIT;
