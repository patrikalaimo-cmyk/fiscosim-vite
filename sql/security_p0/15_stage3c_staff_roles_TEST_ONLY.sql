-- FiscoSim P0 Stage 3C — owner/admin/collaborator RLS behavioral QA.
-- LOCAL ONLY. Fake auth users and staff, real PostgreSQL RLS; all ROLLBACK.
-- Exercises authenticated SQL role with synthetic request.jwt.claim.sub.
-- Not a real JWT signature / browser session E2E test.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
DO $guard$
DECLARE n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3c_test_approval',true)
    IS DISTINCT FROM 'local-role-fixtures-only' THEN
   RAISE EXCEPTION 'Stage3C QA requires local-only opt-in';
 END IF;
 SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
   AND tablename='user_roles'
   AND policyname IN ('p0_user_roles_self_owner_select_lab_only',
                     'p0_user_roles_owner_manage_lab_only');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C role policies missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='utenti_studio' AND policyname='public_access') THEN
    RAISE EXCEPTION 'Stage3C unsafe staff public access still exists';
 END IF;
END $guard$;

-- Three synthetic database identities, no passwords or confirmed sessions.
INSERT INTO auth.users
 (id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('40000000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'p0-stage3c-owner@example.invalid',now(),now()),
 ('40000000-0000-4000-8000-000000000102',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'p0-stage3c-admin@example.invalid',now(),now()),
 ('40000000-0000-4000-8000-000000000103',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'p0-stage3c-collab@example.invalid',now(),now());

INSERT INTO public.utenti_studio
 (id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('40000000-0000-4000-8000-000000000201','Fictitious Owner','p0-stage3c-owner@example.invalid','owner',true,
  '40000000-0000-4000-8000-000000000101'),
 ('40000000-0000-4000-8000-000000000202','Fictitious Admin','p0-stage3c-admin@example.invalid','admin',true,
  '40000000-0000-4000-8000-000000000102'),
 ('40000000-0000-4000-8000-000000000203','Fictitious Collaborator','p0-stage3c-collab@example.invalid','collaboratore',true,
  '40000000-0000-4000-8000-000000000103');

INSERT INTO public.user_roles
 (id,user_id,role) VALUES
 ('40000000-0000-4000-8000-000000000301',
  '40000000-0000-4000-8000-000000000101','owner'),
 ('40000000-0000-4000-8000-000000000302',
  '40000000-0000-4000-8000-000000000102','admin'),
 ('40000000-0000-4000-8000-000000000303',
  '40000000-0000-4000-8000-000000000103','collaboratore');

-- Owner sees/manages all.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='40000000-0000-4000-8000-000000000101';
DO $owner$
DECLARE n bigint;
BEGIN
 IF public.current_utente_ruolo() IS DISTINCT FROM 'owner' THEN
   RAISE EXCEPTION 'Owner role lookup incorrect';
 END IF;
 IF (SELECT count(*) FROM public.utenti_studio
      WHERE id IN ('40000000-0000-4000-8000-000000000201'::uuid,
                   '40000000-0000-4000-8000-000000000202'::uuid,
                   '40000000-0000-4000-8000-000000000203'::uuid))<>3 THEN
   RAISE EXCEPTION 'Owner must read all three staff fixtures';
 END IF;
 IF (SELECT count(*) FROM public.user_roles
      WHERE id IN ('40000000-0000-4000-8000-000000000301'::uuid,
                   '40000000-0000-4000-8000-000000000302'::uuid,
                   '40000000-0000-4000-8000-000000000303'::uuid))<>3 THEN
   RAISE EXCEPTION 'Owner must read all role fixtures without recursion';
 END IF;
 UPDATE public.utenti_studio SET cognome='OwnerUpdated'
   WHERE id='40000000-0000-4000-8000-000000000203'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Owner cannot update staff'; END IF;
 UPDATE public.user_roles SET allowed_client_ids=ARRAY[]::uuid[]
   WHERE id='40000000-0000-4000-8000-000000000303'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Owner cannot update role'; END IF;
 RAISE NOTICE 'PASS: owner can read/manage synthetic staff and roles';
END $owner$;

-- Admin sees staff and roles but cannot change owner or assign roles.
SET LOCAL "request.jwt.claim.sub"='40000000-0000-4000-8000-000000000102';
DO $admin$
DECLARE n bigint;
BEGIN
 IF public.current_utente_ruolo() IS DISTINCT FROM 'admin' THEN
   RAISE EXCEPTION 'Admin role lookup incorrect';
 END IF;
 IF (SELECT count(*) FROM public.utenti_studio WHERE id IN
 ('40000000-0000-4000-8000-000000000201'::uuid,
  '40000000-0000-4000-8000-000000000202'::uuid,
  '40000000-0000-4000-8000-000000000203'::uuid))<>3 THEN
   RAISE EXCEPTION 'Admin staff list denied';
 END IF;
 IF (SELECT count(*) FROM public.user_roles WHERE id IN
 ('40000000-0000-4000-8000-000000000301'::uuid,
  '40000000-0000-4000-8000-000000000302'::uuid,
  '40000000-0000-4000-8000-000000000303'::uuid))<>3 THEN
   RAISE EXCEPTION 'Admin role list denied';
 END IF;
 UPDATE public.user_roles SET role='owner'
   WHERE id='40000000-0000-4000-8000-000000000303'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: admin can escalate role'; END IF;
 RAISE NOTICE 'PASS: admin reads staff/roles, cannot escalate roles';
END $admin$;

-- Collaborator sees only own user profile and own role.
SET LOCAL "request.jwt.claim.sub"='40000000-0000-4000-8000-000000000103';
DO $collab$
DECLARE n bigint;
BEGIN
 IF public.current_utente_ruolo() IS DISTINCT FROM 'collaboratore' THEN
   RAISE EXCEPTION 'Collaborator role lookup incorrect';
 END IF;
 IF (SELECT count(*) FROM public.utenti_studio WHERE id IN
 ('40000000-0000-4000-8000-000000000201'::uuid,
  '40000000-0000-4000-8000-000000000202'::uuid,
  '40000000-0000-4000-8000-000000000203'::uuid))<>1 OR
   NOT EXISTS(SELECT 1 FROM public.utenti_studio
     WHERE id='40000000-0000-4000-8000-000000000203'::uuid) THEN
   RAISE EXCEPTION 'SECURITY FAILURE: collaborator staff visibility';
 END IF;
 IF (SELECT count(*) FROM public.user_roles WHERE id IN
 ('40000000-0000-4000-8000-000000000301'::uuid,
  '40000000-0000-4000-8000-000000000302'::uuid,
  '40000000-0000-4000-8000-000000000303'::uuid))<>1 OR
   NOT EXISTS(SELECT 1 FROM public.user_roles
     WHERE id='40000000-0000-4000-8000-000000000303'::uuid) THEN
   RAISE EXCEPTION 'SECURITY FAILURE: collaborator roles visibility';
 END IF;
 UPDATE public.utenti_studio SET ruolo='owner'
   WHERE id='40000000-0000-4000-8000-000000000203'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: collaborator can escalate staff role'; END IF;
 UPDATE public.user_roles SET role='owner'
   WHERE id='40000000-0000-4000-8000-000000000303'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: collaborator can escalate user_roles'; END IF;
 RAISE NOTICE 'PASS: collaborator sees own profile/role but cannot escalate';
END $collab$;

ROLLBACK;
