-- UNSAFE Stage3N rollback: restarts direct browser account administration.
-- TEST/LAB ONLY. NEVER run on production or any live study database.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3n_rollback_approval',true)
   IS DISTINCT FROM 'unsafe-restore-browser-staff-column-writes' THEN
  RAISE EXCEPTION 'Stage3N unsafe rollback needs LAB opt-in';
 END IF;
 IF has_column_privilege('authenticated','public.utenti_studio','ruolo','UPDATE')
    OR has_column_privilege('authenticated','public.utenti_studio','nome','INSERT') THEN
  RAISE EXCEPTION 'Stage3N direct staff writes not quarantined';
 END IF;
END $gate$;
GRANT INSERT (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati),
      UPDATE (nome,cognome,email,ruolo,attivo,permessi,clienti_assegnati)
 ON TABLE public.utenti_studio TO authenticated;
COMMIT;
