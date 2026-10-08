-- FiscoSim P0 Stage 3C — STAFF/ROLE RLS containment, LOCAL LAB ONLY.
-- Never use on FiscoSim real database. No business data is changed in this script.
-- Requires successful Stage 2/3A and the two hardened identity lookup helpers.
-- Intentional scope: ONLY public.utenti_studio and public.user_roles.
-- Unresolved: staff.password_hash exposure via authenticated SELECT *.
-- Production requires API/component column minimization before release.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $guard$
DECLARE n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3c_approval',true)
    IS DISTINCT FROM 'local-staff-roles-only' THEN
   RAISE EXCEPTION 'Stage3C requires local-only opt-in';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relkind IN ('r','p')) <> 73 THEN
   RAISE EXCEPTION 'Stage3C schema baseline mismatch';
 END IF;
 SELECT count(*) INTO n FROM pg_proc p
   JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('current_utente_ruolo','current_utente_studio_id')
     AND p.prosecdef
     AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
     AND has_function_privilege('authenticated',p.oid,'EXECUTE');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C requires hardened role helpers'; END IF;
 -- Stage 1 already removed public_access; requiring its presence here
 -- would incorrectly reject the valid post-Stage1 clone before any DDL.
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='utenti_studio'
     AND policyname='public_access';
 IF n<>0 THEN RAISE EXCEPTION 'Stage3C requires Stage1 removal of staff public_access'; END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='utenti_studio'
     AND policyname IN ('utenti_studio_owner_manage','utenti_studio_self_or_owner_select');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C users restricted policies missing'; END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles'
     AND policyname='Lettura autenticati' AND cmd='SELECT'
     AND roles=ARRAY['authenticated']::name[]
     AND lower(btrim(qual))='true';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3C roles read baseline mismatch'; END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles'
     AND policyname='Gestione solo owner' AND cmd='ALL'
     AND roles=ARRAY['authenticated']::name[]
     AND qual LIKE '%FROM user_roles ur%';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3C roles recursive policy baseline mismatch'; END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles';
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C unexpected roles policy count %',n; END IF;
END $guard$;

REVOKE ALL PRIVILEGES ON TABLE public.utenti_studio,public.user_roles FROM anon;

-- Existing restricted staff policies (self/owner select and owner manage)
-- stay unchanged. Stage 1 already dropped the unsafe public_access policy.
-- Stage 3C only changes user_roles and anon grants; never re-add public_access.

-- Replace self-referencing owner rule and unrestricted authenticated list.
DROP POLICY "Lettura autenticati" ON public.user_roles;
DROP POLICY "Gestione solo owner" ON public.user_roles;

CREATE POLICY p0_user_roles_self_owner_select_lab_only
 ON public.user_roles FOR SELECT TO authenticated
 USING (
   user_id = (SELECT auth.uid())
   OR public.is_owner_or_admin()
 );

CREATE POLICY p0_user_roles_owner_manage_lab_only
 ON public.user_roles FOR ALL TO authenticated
 USING (public.current_utente_ruolo() = 'owner')
 WITH CHECK (public.current_utente_ruolo() = 'owner');

DO $assert$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('utenti_studio','user_roles')
   AND (lower(btrim(coalesce(qual,'')))='true' OR
        lower(btrim(coalesce(with_check,'')))='true');
 IF n<>0 THEN RAISE EXCEPTION 'Stage3C residual true policy count %',n; END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles'
    AND policyname IN ('p0_user_roles_self_owner_select_lab_only','p0_user_roles_owner_manage_lab_only');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C expected policies absent: %',n; END IF;
 IF has_table_privilege('anon','public.utenti_studio','SELECT') OR
    has_table_privilege('anon','public.user_roles','SELECT') THEN
   RAISE EXCEPTION 'Stage3C anon staff/roles read still granted';
 END IF;
END $assert$;
COMMIT;
