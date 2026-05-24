alter table if exists public.utenti_studio
  add column if not exists auth_user_id uuid;

create unique index if not exists utenti_studio_auth_user_id_key
  on public.utenti_studio (auth_user_id)
  where auth_user_id is not null;

comment on column public.utenti_studio.auth_user_id is 'Foreign identity link to auth.users.id for server-backed authentication';

update public.utenti_studio
set password_hash = null
where password_hash is not null
  and auth_user_id is not null;
