-- P0 Stage3N supplemental database boundary: prevent bypassing scoped /api/auth/users.
-- ISOLATED DOCKER LAB ONLY. No business data writes or user account changes.
-- Retains existing explicitly granted read-only profile columns for browser.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

DO $guard$
DECLARE c text;
BEGIN
 IF current_setting('fiscosim.p0_stage3n_approval',true)
   IS DISTINCT FROM 'local-server-only-staff-writes' THEN
  RAISE EXCEPTION 'Stage3N staff-write guard: LAB approval missing';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='utenti_studio' AND c.relrowsecurity
 ) THEN
  RAISE EXCEPTION 'Stage3N staff RLS prerequisite absent';
 END IF;
 -- Two supported states: original Stage3G grants or already-applied Stage3N.
 -- Any partial/mixed state is rejected. The subsequent verification checks
 -- *every* column so a stray grant cannot be silently accepted.
 IF has_column_privilege('authenticated','public.utenti_studio','nome','INSERT')
    IS DISTINCT FROM
    has_column_privilege('authenticated','public.utenti_studio','ruolo','UPDATE')
 THEN
  RAISE EXCEPTION 'Stage3N inconsistent staff ACL: partial prior patch';
 END IF;
 IF has_column_privilege('authenticated','public.utenti_studio','password_hash','SELECT')
    OR NOT has_column_privilege('authenticated','public.utenti_studio','nome','SELECT')
    OR NOT has_column_privilege('service_role','public.utenti_studio','ruolo','UPDATE')
 THEN
  RAISE EXCEPTION 'Stage3N unexpected protected staff-ACL baseline';
 END IF;
 IF has_table_privilege('authenticated','public.utenti_studio','INSERT')
   OR has_table_privilege('authenticated','public.utenti_studio','UPDATE') THEN
  RAISE EXCEPTION 'Stage3N unexpected broad authenticated table write';
 END IF;
END $guard$;

REVOKE INSERT (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati),
       UPDATE (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio FROM authenticated;

DO $check$
DECLARE c text; op text;
BEGIN
 FOR c IN
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='utenti_studio'
 LOOP
  FOREACH op IN ARRAY ARRAY['INSERT','UPDATE'] LOOP
   IF has_column_privilege('authenticated','public.utenti_studio',c,op) THEN
    RAISE EXCEPTION 'Stage3N browser write allowed: % %',c,op;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_column_privilege('authenticated','public.utenti_studio','nome','SELECT')
   OR NOT has_column_privilege('authenticated','public.utenti_studio','auth_user_id','SELECT')
   OR has_column_privilege('authenticated','public.utenti_studio','password_hash','SELECT') THEN
  RAISE EXCEPTION 'Stage3N read-only staff projection broken';
 END IF;
 FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
  IF NOT has_table_privilege('service_role','public.utenti_studio',op) THEN
   RAISE EXCEPTION 'Stage3N service_role lost %',op;
  END IF;
 END LOOP;
END $check$;
COMMIT;
