-- FiscoSim P0 Stage3G — sensitive staff column ACL, isolated LAB ONLY.
-- Do not apply to production. Browser legacy dev-bypass password login
-- and .select('*') user manager are incompatible and require app migration.
-- The service_role retains its original grants for /api/auth/users.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
DECLARE n int;
BEGIN
 IF current_setting('fiscosim.p0_stage3g_approval',true)
   IS DISTINCT FROM 'local-staff-secret-column-only' THEN
  RAISE EXCEPTION 'Stage3G local-only guard failed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace s
  ON s.oid=c.relnamespace WHERE s.nspname='public'
  AND c.relname='utenti_studio' AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'Stage3G staff RLS prerequisite failed';
 END IF;
 SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema='public' AND table_name='utenti_studio'
   AND column_name IN ('id','nome','cognome','email','ruolo','attivo',
   'created_at','permessi','clienti_assegnati','auth_user_id','password_hash');
 IF n<>11 THEN RAISE EXCEPTION 'Stage3G unexpected staff column schema'; END IF;
 IF NOT has_column_privilege('authenticated',
   'public.utenti_studio','password_hash','SELECT')
  OR NOT has_column_privilege('authenticated',
   'public.utenti_studio','password_hash','UPDATE')
  OR NOT has_table_privilege('authenticated',
   'public.utenti_studio','TRUNCATE') THEN
  RAISE EXCEPTION 'Stage3G baseline already changed: stop';
 END IF;
 SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public'
  AND tablename='utenti_studio' AND policyname IN
     ('utenti_studio_owner_manage','utenti_studio_self_or_owner_select');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3G owner/self policies missing'; END IF;
 IF has_table_privilege('anon','public.utenti_studio','SELECT') THEN
  RAISE EXCEPTION 'Stage3G Stage1 anon SELECT not revoked';
 END IF;
END $gate$;

-- Revoke table-wide ACL FIRST; revoking only a column cannot override
-- a table-level grant. Also remove TRUNCATE/TRIGGER/REFERENCES/MAINTAIN.
REVOKE ALL PRIVILEGES ON TABLE public.utenti_studio
 FROM authenticated, anon, PUBLIC;

-- Read-only profile fields; credential hash excluded.
GRANT SELECT (id,nome,cognome,email,ruolo,attivo,created_at,
 permessi,clienti_assegnati,auth_user_id)
 ON TABLE public.utenti_studio TO authenticated;

-- Strictly limited compatibility for RLS-authorized direct writes.
-- auth_user_id and password_hash MUST be modified only by service_role
-- through the authorized server provisioning workflow.
GRANT INSERT (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio TO authenticated;
GRANT UPDATE (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio TO authenticated;
GRANT DELETE ON TABLE public.utenti_studio TO authenticated;

DO $verify$
DECLARE col text;
BEGIN
 FOREACH col IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
  IF has_column_privilege('authenticated','public.utenti_studio',
     'password_hash',col) THEN
    RAISE EXCEPTION 'Stage3G staff credential remains accessible with %',col;
  END IF;
 END LOOP;
 FOREACH col IN ARRAY ARRAY['INSERT','UPDATE'] LOOP
  IF has_column_privilege('authenticated','public.utenti_studio',
     'auth_user_id',col) THEN
    RAISE EXCEPTION 'Stage3G auth_user_id remains writable with %',col;
  END IF;
 END LOOP;
 FOREACH col IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] LOOP
  IF has_table_privilege('authenticated','public.utenti_studio',col) THEN
    RAISE EXCEPTION 'Stage3G dangerous table privilege remains: %',col;
  END IF;
 END LOOP;
 IF NOT has_column_privilege('authenticated','public.utenti_studio',
     'nome','SELECT')
  OR NOT has_column_privilege('authenticated','public.utenti_studio',
     'auth_user_id','SELECT')
  OR NOT has_column_privilege('authenticated','public.utenti_studio',
     'ruolo','UPDATE') THEN
    RAISE EXCEPTION 'Stage3G necessary profile ACL was lost';
 END IF;
 IF has_table_privilege('anon','public.utenti_studio','SELECT') THEN
    RAISE EXCEPTION 'Stage3G anonymous staff grant was reopened';
 END IF;
END $verify$;
COMMIT;
