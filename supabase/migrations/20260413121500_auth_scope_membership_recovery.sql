create or replace function public.user_has_societa_access(target_societa uuid)
returns boolean
language plpgsql
stable
as $$
declare
  resolved_role text;
  current_utente uuid;
  has_access boolean := false;
begin
  if target_societa is null or auth.uid() is null then
    return false;
  end if;

  resolved_role := public.current_utente_ruolo();
  if resolved_role in ('owner', 'admin') then
    return true;
  end if;

  if to_regclass('public.utenti_studio_societa') is null then
    return false;
  end if;

  current_utente := public.current_utente_studio_id();

  select exists (
    select 1
    from public.utenti_studio_societa uss
    where uss.societa_id = target_societa
      and (
        uss.auth_user_id = auth.uid()
        or (current_utente is not null and uss.utente_id = current_utente)
      )
  )
  into has_access;

  return coalesce(has_access, false);
end;
$$;

create or replace function public.current_default_societa_id()
returns uuid
language plpgsql
stable
as $$
declare
  result uuid;
  resolved_role text;
  current_utente uuid;
  active_societa_count integer := 0;
begin
  if auth.uid() is null then
    return null;
  end if;

  current_utente := public.current_utente_studio_id();

  if to_regclass('public.utenti_studio_societa') is not null then
    select uss.societa_id
    into result
    from public.utenti_studio_societa uss
    where uss.auth_user_id = auth.uid()
       or (current_utente is not null and uss.utente_id = current_utente)
    order by coalesce(uss.is_default, false) desc, uss.created_at asc, uss.societa_id asc
    limit 1;

    if result is not null then
      return result;
    end if;
  end if;

  resolved_role := public.current_utente_ruolo();
  select count(*)
  into active_societa_count
  from public.societa s
  where coalesce(s.attiva, true) = true;

  if resolved_role in ('owner', 'admin') or active_societa_count = 1 then
    select s.id
    into result
    from public.societa s
    where coalesce(s.attiva, true) = true
    order by s.denominazione asc, s.id asc
    limit 1;
  end if;

  return result;
end;
$$;

update public.utenti_studio us
set auth_user_id = au.id
from auth.users au
where us.auth_user_id is null
  and us.email is not null
  and lower(trim(us.email)) = lower(trim(au.email));

update public.utenti_studio_societa uss
set auth_user_id = us.auth_user_id
from public.utenti_studio us
where us.id = uss.utente_id
  and us.auth_user_id is not null
  and uss.auth_user_id is distinct from us.auth_user_id;

insert into public.utenti_studio_societa (utente_id, auth_user_id, societa_id, ruolo, is_default)
select
  us.id,
  us.auth_user_id,
  soc.id,
  case when us.ruolo in ('owner', 'admin') then us.ruolo else 'collaboratore' end,
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

with ranked as (
  select
    id,
    row_number() over (
      partition by utente_id
      order by coalesce(is_default, false) desc, created_at asc, societa_id asc
    ) as row_num
  from public.utenti_studio_societa
)
update public.utenti_studio_societa uss
set is_default = ranked.row_num = 1
from ranked
where ranked.id = uss.id
  and uss.is_default is distinct from (ranked.row_num = 1);