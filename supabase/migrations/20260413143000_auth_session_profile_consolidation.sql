create or replace function public.user_has_societa_access(target_societa uuid)
returns boolean
language plpgsql
stable
as $$
declare
  user_role text;
begin
  if auth.uid() is null or target_societa is null then
    return false;
  end if;

  user_role := public.current_utente_ruolo();
  if user_role in ('owner', 'admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.utenti_studio_societa uss
    join public.utenti_studio us on us.id = uss.utente_id
    where uss.societa_id = target_societa
      and us.attivo = true
      and (
        uss.auth_user_id = auth.uid()
        or us.auth_user_id = auth.uid()
      )
  );
end;
$$;

update public.utenti_studio us
set auth_user_id = au.id
from auth.users au
where us.attivo = true
  and us.email is not null
  and lower(trim(us.email)) = lower(trim(au.email))
  and us.auth_user_id is distinct from au.id;

update public.utenti_studio_societa uss
set auth_user_id = us.auth_user_id
from public.utenti_studio us
where us.id = uss.utente_id
  and us.attivo = true
  and us.auth_user_id is not null
  and uss.auth_user_id is distinct from us.auth_user_id;

insert into public.utenti_studio_societa (utente_id, auth_user_id, societa_id, ruolo, is_default)
select
  us.id,
  us.auth_user_id,
  soc.id,
  case
    when us.ruolo in ('owner', 'admin') then us.ruolo
    else 'collaboratore'
  end,
  soc.row_num = 1
from public.utenti_studio us
join lateral (
  select
    s.id,
    row_number() over (order by s.denominazione asc, s.id asc) as row_num
  from public.societa s
  where coalesce(s.attiva, true) = true
) soc on true
where us.attivo = true
  and us.auth_user_id is not null
  and us.ruolo in ('owner', 'admin')
  and not exists (
    select 1
    from public.utenti_studio_societa existing
    where existing.utente_id = us.id
  );

insert into public.utenti_studio_societa (utente_id, auth_user_id, societa_id, ruolo, is_default)
select
  us.id,
  us.auth_user_id,
  single_soc.id,
  'collaboratore',
  true
from public.utenti_studio us
cross join lateral (
  select s.id
  from public.societa s
  where coalesce(s.attiva, true) = true
  order by s.denominazione asc, s.id asc
  limit 1
) single_soc
where us.attivo = true
  and us.auth_user_id is not null
  and us.ruolo not in ('owner', 'admin')
  and 1 = (
    select count(*)
    from public.societa s
    where coalesce(s.attiva, true) = true
  )
  and not exists (
    select 1
    from public.utenti_studio_societa existing
    where existing.utente_id = us.id
  );

delete from public.utenti_studio_societa uss
where exists (
  select 1
  from public.utenti_studio us
  where us.id = uss.utente_id
    and coalesce(us.attivo, true) = false
);

with ranked as (
  select
    uss.id,
    uss.utente_id,
    row_number() over (
      partition by uss.utente_id
      order by coalesce(uss.is_default, false) desc, uss.created_at asc, uss.societa_id asc
    ) as row_num
  from public.utenti_studio_societa uss
)
update public.utenti_studio_societa target
set is_default = ranked.row_num = 1
from ranked
where ranked.id = target.id
  and target.is_default is distinct from (ranked.row_num = 1);
