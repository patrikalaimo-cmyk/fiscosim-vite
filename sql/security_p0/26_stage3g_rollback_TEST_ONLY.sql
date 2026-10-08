-- UNSAFE RESTORATION of pre-Stage3G authenticated staff table ACL.
-- LAB ONLY. Restores dangerous table-wide access; never apply in production.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3g_rollback_approval',true)
   IS DISTINCT FROM 'unsafe-p0-lab-revert-staff-acl' THEN
  RAISE EXCEPTION 'Stage3G rollback requires dangerous LAB approval';
 END IF;
 IF has_column_privilege('authenticated','public.utenti_studio',
   'password_hash','SELECT') THEN
  RAISE EXCEPTION 'Stage3G ACL patch not installed';
 END IF;
END $gate$;
REVOKE ALL PRIVILEGES ON TABLE public.utenti_studio FROM authenticated;
REVOKE SELECT (id,nome,cognome,email,ruolo,attivo,created_at,
 permessi,clienti_assegnati,auth_user_id)
 ON TABLE public.utenti_studio FROM authenticated;
REVOKE INSERT (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio FROM authenticated;
REVOKE UPDATE (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio FROM authenticated;
GRANT ALL PRIVILEGES ON TABLE public.utenti_studio TO authenticated;
COMMIT;
