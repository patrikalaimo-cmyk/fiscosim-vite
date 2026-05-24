create or replace function public.current_default_societa_id()
returns uuid
language plpgsql
stable
as $$
declare
  result uuid;
begin
  if auth.uid() is null or to_regclass('public.utenti_studio_societa') is null then
    return null;
  end if;

  select uss.societa_id
  into result
  from public.utenti_studio_societa uss
  where uss.auth_user_id = auth.uid()
  order by coalesce(uss.is_default, false) desc, uss.created_at asc, uss.societa_id asc
  limit 1;

  return result;
end;
$$;

create or replace function public.ensure_masterdata_societa_scope_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.societa_id is null then
    new.societa_id := public.current_default_societa_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_piano_conti_societa_scope_defaults on public.piano_conti;
create trigger trg_piano_conti_societa_scope_defaults
before insert or update on public.piano_conti
for each row
execute function public.ensure_masterdata_societa_scope_defaults();

drop trigger if exists trg_causali_contabili_societa_scope_defaults on public.causali_contabili;
create trigger trg_causali_contabili_societa_scope_defaults
before insert or update on public.causali_contabili
for each row
execute function public.ensure_masterdata_societa_scope_defaults();

drop trigger if exists trg_causali_iva_societa_scope_defaults on public.causali_iva;
create trigger trg_causali_iva_societa_scope_defaults
before insert or update on public.causali_iva
for each row
execute function public.ensure_masterdata_societa_scope_defaults();

create or replace function public.clone_null_scoped_rows_to_active_societa(p_table regclass, p_match_cols text[])
returns void
language plpgsql
as $$
declare
  v_schema text;
  v_table text;
  target_cols text;
  source_exprs text;
  match_sql text;
  sql_text text;
begin
  select n.nspname, c.relname
  into v_schema, v_table
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.oid = p_table;

  if v_table is null then
    return;
  end if;

  select
    string_agg(format('%I', column_name), ', ' order by ordinal_position),
    string_agg(
      case
        when column_name = 'societa_id' then 'soc.id'
        else format('src.%I', column_name)
      end,
      ', ' order by ordinal_position
    )
  into target_cols, source_exprs
  from information_schema.columns
  where table_schema = v_schema
    and table_name = v_table
    and column_name <> 'id';

  if target_cols is null or source_exprs is null then
    return;
  end if;

  select string_agg(format('dst.%1$I is not distinct from src.%1$I', col), ' and ')
  into match_sql
  from unnest(coalesce(p_match_cols, array[]::text[])) as col;

  if coalesce(match_sql, '') = '' then
    match_sql := 'false';
  end if;

  sql_text := format(
    $fmt$
      insert into %1$I.%2$I (%3$s)
      select %4$s
      from %1$I.%2$I src
      cross join public.societa soc
      where src.societa_id is null
        and coalesce(soc.attiva, true) = true
        and not exists (
          select 1
          from %1$I.%2$I dst
          where dst.societa_id = soc.id
            and %5$s
        )
    $fmt$,
    v_schema,
    v_table,
    target_cols,
    source_exprs,
    match_sql
  );

  execute sql_text;

  execute format(
    'delete from %1$I.%2$I where societa_id is null and exists (select 1 from public.societa s where coalesce(s.attiva, true) = true)',
    v_schema,
    v_table
  );
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
  and not exists (
    select 1
    from public.utenti_studio_societa existing
    where existing.utente_id = us.id
  );

select public.clone_null_scoped_rows_to_active_societa('public.piano_conti'::regclass, array['codice']);
select public.clone_null_scoped_rows_to_active_societa('public.causali_contabili'::regclass, array['codice']);
select public.clone_null_scoped_rows_to_active_societa('public.causali_iva'::regclass, array['codice']);

drop function if exists public.clone_null_scoped_rows_to_active_societa(regclass, text[]);

update public.prima_nota pn
set company_id = coalesce(pn.company_id, pn.societa_id),
    tenant_id = coalesce(pn.tenant_id, pn.company_id, pn.societa_id),
    visibility = coalesce(pn.visibility, 'shared')
where pn.company_id is null
   or pn.tenant_id is null
   or pn.visibility is null;

update public.prima_nota_righe pr
set company_id = coalesce(pr.company_id, pn.company_id, pn.societa_id),
    tenant_id = coalesce(pr.tenant_id, pr.company_id, pn.company_id, pn.societa_id),
    created_by = coalesce(pr.created_by, pn.created_by),
    owner_user_id = coalesce(pr.owner_user_id, pn.owner_user_id, pn.created_by),
    visibility = coalesce(pr.visibility, pn.visibility, 'shared')
from public.prima_nota pn
where pn.id = pr.prima_nota_id
  and (
    pr.company_id is null
    or pr.tenant_id is null
    or pr.created_by is null
    or pr.owner_user_id is null
    or pr.visibility is null
  );

update public.partitario pt
set societa_id = coalesce(pt.societa_id, pn.societa_id),
    company_id = coalesce(pt.company_id, pn.company_id, pn.societa_id),
    tenant_id = coalesce(pt.tenant_id, pt.company_id, pn.company_id, pn.societa_id),
    created_by = coalesce(pt.created_by, pn.created_by),
    owner_user_id = coalesce(pt.owner_user_id, pn.owner_user_id, pn.created_by),
    visibility = coalesce(pt.visibility, pn.visibility, 'shared')
from public.prima_nota pn
where pn.id = pt.prima_nota_id
  and (
    pt.societa_id is null
    or pt.company_id is null
    or pt.tenant_id is null
    or pt.created_by is null
    or pt.owner_user_id is null
    or pt.visibility is null
  );

create or replace function public.ensure_prima_nota_child_scope_defaults()
returns trigger
language plpgsql
as $$
declare
  parent_company uuid;
  parent_created_by uuid;
  parent_owner_user_id uuid;
  parent_visibility text;
begin
  if new.prima_nota_id is not null then
    select
      coalesce(pn.company_id, pn.societa_id),
      pn.created_by,
      coalesce(pn.owner_user_id, pn.created_by),
      coalesce(pn.visibility, 'shared')
    into parent_company, parent_created_by, parent_owner_user_id, parent_visibility
    from public.prima_nota pn
    where pn.id = new.prima_nota_id;

    if new.company_id is null then
      new.company_id := parent_company;
    end if;
    if new.tenant_id is null then
      new.tenant_id := coalesce(new.company_id, parent_company);
    end if;
    if new.created_by is null then
      new.created_by := parent_created_by;
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := parent_owner_user_id;
    end if;
    if new.visibility is null then
      new.visibility := parent_visibility;
    end if;
  end if;

  if new.created_by is null then
    new.created_by := public.current_utente_studio_id();
  end if;
  if new.owner_user_id is null then
    new.owner_user_id := new.created_by;
  end if;
  if new.visibility is null then
    new.visibility := 'shared';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_partitario_scope_defaults()
returns trigger
language plpgsql
as $$
declare
  parent_societa uuid;
  parent_company uuid;
  parent_created_by uuid;
  parent_owner_user_id uuid;
  parent_visibility text;
begin
  if new.prima_nota_id is not null then
    select
      pn.societa_id,
      coalesce(pn.company_id, pn.societa_id),
      pn.created_by,
      coalesce(pn.owner_user_id, pn.created_by),
      coalesce(pn.visibility, 'shared')
    into parent_societa, parent_company, parent_created_by, parent_owner_user_id, parent_visibility
    from public.prima_nota pn
    where pn.id = new.prima_nota_id;

    if new.societa_id is null then
      new.societa_id := parent_societa;
    end if;
    if new.company_id is null then
      new.company_id := parent_company;
    end if;
    if new.tenant_id is null then
      new.tenant_id := coalesce(new.company_id, parent_company, parent_societa);
    end if;
    if new.created_by is null then
      new.created_by := parent_created_by;
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := parent_owner_user_id;
    end if;
    if new.visibility is null then
      new.visibility := parent_visibility;
    end if;
  end if;

  if new.created_by is null then
    new.created_by := public.current_utente_studio_id();
  end if;
  if new.owner_user_id is null then
    new.owner_user_id := new.created_by;
  end if;
  if new.visibility is null then
    new.visibility := 'shared';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prima_nota_partitario_scope_defaults on public.partitario;
create trigger trg_prima_nota_partitario_scope_defaults
before insert or update on public.partitario
for each row
execute function public.ensure_partitario_scope_defaults();

drop policy if exists prima_nota_righe_policy on public.prima_nota_righe;
create policy prima_nota_righe_policy on public.prima_nota_righe
for all
using (public.user_can_access_scoped_row(company_id, created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(company_id, created_by, owner_user_id));

drop policy if exists prima_nota_partitario_policy on public.partitario;
drop policy if exists societa_scoped_generic_policy_partitario on public.partitario;
create policy partitario_policy on public.partitario
for all
using (public.user_can_access_scoped_row(coalesce(company_id, societa_id), created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(coalesce(company_id, societa_id), created_by, owner_user_id));
