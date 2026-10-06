with upsert_societa as (
  insert into public.societa (
    id,
    codice,
    denominazione,
    ragione_sociale,
    attiva
  )
  values (
    '3416f210-345e-4197-b391-cee4383682da',
    'DEV',
    'FiscoSim Studio Locale',
    'FiscoSim Studio Locale',
    true
  )
  on conflict (codice) do update
  set
    denominazione = excluded.denominazione,
    ragione_sociale = excluded.ragione_sociale,
    attiva = excluded.attiva
  returning id
), upsert_user as (
  insert into public.utenti_studio (
    id,
    nome,
    cognome,
    email,
    permessi,
    clienti_assegnati,
    ruolo,
    attivo,
    auth_user_id
  )
  values (
    '7d0f1b56-74bb-4c55-b9a4-4e0d7c8c1a01',
    'Dev',
    'Locale',
    'dev.local@fiscosim.local',
    '{}'::jsonb,
    '{}'::uuid[],
    'owner',
    true,
    '7d0f1b56-74bb-4c55-b9a4-4e0d7c8c1a01'
  )
  on conflict (email) do update
  set
    nome = excluded.nome,
    cognome = excluded.cognome,
    permessi = excluded.permessi,
    clienti_assegnati = excluded.clienti_assegnati,
    ruolo = excluded.ruolo,
    attivo = excluded.attivo,
    auth_user_id = excluded.auth_user_id
  returning id
), upsert_relation as (
  insert into public.utenti_studio_societa (
    utente_id,
    auth_user_id,
    societa_id,
    ruolo,
    is_default
  )
  select
    upsert_user.id,
    upsert_user.id,
    upsert_societa.id,
    'owner',
    true
  from upsert_user
  cross join upsert_societa
  on conflict (utente_id, societa_id) do update
  set
    auth_user_id = excluded.auth_user_id,
    ruolo = excluded.ruolo,
    is_default = excluded.is_default
  returning id
)
select
  (select id from upsert_societa) as societa_id,
  (select id from upsert_user) as utente_id,
  (select id from upsert_relation) as relation_id;