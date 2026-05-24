
create table if not exists public.utenti_studio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text,
  email text not null,
  permessi jsonb not null default '{}'::jsonb,
  clienti_assegnati uuid[] not null default '{}'::uuid[],
  password_hash text,
  ruolo text not null default 'collaboratore',
  attivo boolean not null default true,
  auth_user_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists utenti_studio_email_key
  on public.utenti_studio (email);
