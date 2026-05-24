create table if not exists public.utenti_studio_societa (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid not null references public.utenti_studio(id) on delete cascade,
  auth_user_id uuid not null,
  societa_id uuid not null references public.societa(id) on delete cascade,
  ruolo text not null default 'collaboratore',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (utente_id, societa_id),
  unique (auth_user_id, societa_id)
);

create index if not exists utenti_studio_societa_auth_idx on public.utenti_studio_societa (auth_user_id, societa_id);
create index if not exists utenti_studio_societa_societa_idx on public.utenti_studio_societa (societa_id, auth_user_id);

alter table if exists public.documenti_contabilita
  alter column company_id set default null;

alter table if exists public.prima_nota
  alter column company_id set default null;

alter table if exists public.prima_nota_righe
  alter column company_id set default null;

alter table if exists public.partitario
  alter column company_id set default null;

alter table if exists public.documenti_import
  alter column company_id set default null;

alter table if exists public.accounting_entries
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.registri_iva
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.liquidazione_iva
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.piano_conti
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.causali_contabili
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.causali_iva
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.percipienti
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.regole_automatiche
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.partitario
  add column if not exists societa_id uuid references public.societa(id);

update public.documenti_contabilita
set company_id = coalesce(company_id, societa_id),
    tenant_id = coalesce(tenant_id, societa_id)
where societa_id is not null;

update public.prima_nota
set company_id = coalesce(company_id, societa_id),
    tenant_id = coalesce(tenant_id, societa_id)
where societa_id is not null;

update public.prima_nota_righe r
set company_id = coalesce(r.company_id, pn.societa_id),
    tenant_id = coalesce(r.tenant_id, pn.societa_id)
from public.prima_nota pn
where pn.id = r.prima_nota_id
  and pn.societa_id is not null;

update public.partitario pnp
set company_id = coalesce(pnp.company_id, pn.societa_id),
    tenant_id = coalesce(pnp.tenant_id, pn.societa_id)
from public.prima_nota pn
where pn.id = pnp.prima_nota_id
  and pn.societa_id is not null;

update public.documenti_import
set company_id = coalesce(company_id, societa_destinazione_id),
    tenant_id = coalesce(tenant_id, societa_destinazione_id)
where societa_destinazione_id is not null;

update public.accounting_entries ae
set societa_id = dc.societa_id,
    company_id = coalesce(ae.company_id, dc.societa_id),
    tenant_id = coalesce(ae.tenant_id, dc.societa_id)
from public.documenti_contabilita dc
where dc.id::text = ae.document_id
  and dc.societa_id is not null
  and (ae.societa_id is null or ae.company_id is null or ae.tenant_id is null);

update public.registri_iva ri
set societa_id = dc.societa_id
from public.documenti_contabilita dc
where dc.id::text = ri.documento_id
  and dc.societa_id is not null
  and ri.societa_id is null;

create or replace function public.current_auth_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function public.current_utente_studio_id()
returns uuid
language sql
stable
as $$
  select us.id
  from public.utenti_studio us
  where us.auth_user_id = auth.uid()
    and us.attivo = true
  limit 1
$$;

create or replace function public.current_utente_ruolo()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select us.ruolo
      from public.utenti_studio us
      where us.auth_user_id = auth.uid()
        and us.attivo = true
      limit 1
    ),
    'collaboratore'
  )
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_utente_ruolo() in ('owner', 'admin')
$$;

create or replace function public.user_has_societa_access(target_societa uuid)
returns boolean
language sql
stable
as $$
  select
    target_societa is not null
    and exists (
      select 1
      from public.utenti_studio_societa uss
      where uss.auth_user_id = auth.uid()
        and uss.societa_id = target_societa
    )
$$;

create or replace function public.user_can_access_cliente(target_cliente uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_owner_or_admin()
    or exists (
      select 1
      from public.utenti_studio us
      where us.auth_user_id = auth.uid()
        and us.attivo = true
        and (
          coalesce((us.permessi -> 'clienti' ->> 'solo_assegnati')::boolean, false) = false
          or target_cliente = any(coalesce(us.clienti_assegnati, '{}'::uuid[]))
        )
    )
$$;

create or replace function public.user_can_access_scoped_row(
  row_company_id uuid,
  row_created_by uuid,
  row_owner_user_id uuid,
  row_visibility text
)
returns boolean
language sql
stable
as $$
  select
    public.user_has_societa_access(row_company_id)
    and (
      public.is_owner_or_admin()
      or coalesce(row_visibility, 'shared') = 'shared'
      or row_created_by = public.current_utente_studio_id()
      or row_owner_user_id = public.current_utente_studio_id()
    )
$$;

create or replace function public.user_can_write_scoped_row(
  row_company_id uuid,
  row_created_by uuid,
  row_owner_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    public.user_has_societa_access(row_company_id)
    and (
      public.is_owner_or_admin()
      or row_created_by = public.current_utente_studio_id()
      or row_owner_user_id = public.current_utente_studio_id()
      or row_created_by is null
    )
$$;

create or replace function public.sync_utenti_studio_societa_auth()
returns trigger
language plpgsql
as $$
begin
  if new.auth_user_id is not null then
    update public.utenti_studio_societa
    set auth_user_id = new.auth_user_id
    where utente_id = new.id
      and auth_user_id is distinct from new.auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_utenti_studio_societa_auth on public.utenti_studio;
create trigger trg_sync_utenti_studio_societa_auth
after insert or update of auth_user_id on public.utenti_studio
for each row
execute function public.sync_utenti_studio_societa_auth();

create or replace function public.ensure_company_scope_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null then
    new.company_id := coalesce(new.societa_id, new.company_id);
  end if;
  if new.tenant_id is null then
    new.tenant_id := new.company_id;
  end if;
  if new.created_by is null then
    new.created_by := public.current_utente_studio_id();
  end if;
  if new.visibility is null then
    new.visibility := 'shared';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documenti_contabilita_scope_defaults on public.documenti_contabilita;
create trigger trg_documenti_contabilita_scope_defaults
before insert or update on public.documenti_contabilita
for each row
execute function public.ensure_company_scope_defaults();

drop trigger if exists trg_prima_nota_scope_defaults on public.prima_nota;
create trigger trg_prima_nota_scope_defaults
before insert or update on public.prima_nota
for each row
execute function public.ensure_company_scope_defaults();

drop trigger if exists trg_documenti_import_scope_defaults on public.documenti_import;
create trigger trg_documenti_import_scope_defaults
before insert or update on public.documenti_import
for each row
execute function public.ensure_company_scope_defaults();

create or replace function public.ensure_prima_nota_child_scope_defaults()
returns trigger
language plpgsql
as $$
declare
  parent_company uuid;
begin
  if new.prima_nota_id is not null then
    select pn.societa_id into parent_company
    from public.prima_nota pn
    where pn.id = new.prima_nota_id;

    if new.company_id is null then
      new.company_id := parent_company;
    end if;
    if new.tenant_id is null then
      new.tenant_id := new.company_id;
    end if;
  end if;
  if new.created_by is null then
    new.created_by := public.current_utente_studio_id();
  end if;
  if new.visibility is null then
    new.visibility := 'shared';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prima_nota_righe_scope_defaults on public.prima_nota_righe;
create trigger trg_prima_nota_righe_scope_defaults
before insert or update on public.prima_nota_righe
for each row
execute function public.ensure_prima_nota_child_scope_defaults();

drop trigger if exists trg_prima_nota_partitario_scope_defaults on public.partitario;
create trigger trg_prima_nota_partitario_scope_defaults
before insert or update on public.partitario
for each row
execute function public.ensure_prima_nota_child_scope_defaults();

alter table if exists public.societa enable row level security;
alter table if exists public.utenti_studio enable row level security;
alter table if exists public.utenti_studio_societa enable row level security;
alter table if exists public.clienti enable row level security;
alter table if exists public.documenti_import enable row level security;
alter table if exists public.documenti_contabilita enable row level security;
alter table if exists public.prima_nota enable row level security;
alter table if exists public.prima_nota_righe enable row level security;
alter table if exists public.partitario enable row level security;
alter table if exists public.accounting_entries enable row level security;
alter table if exists public.registri_iva enable row level security;
alter table if exists public.liquidazione_iva enable row level security;
alter table if exists public.piano_conti enable row level security;
alter table if exists public.causali_contabili enable row level security;
alter table if exists public.causali_iva enable row level security;
alter table if exists public.percipienti enable row level security;
alter table if exists public.regole_automatiche enable row level security;
alter table if exists public.partitario enable row level security;

drop policy if exists allow_all_utenti on public.utenti_studio;
drop policy if exists allow_all_clienti on public.clienti;
drop policy if exists allow_all_societa on public.societa;
drop policy if exists allow_all_documenti on public.documenti_contabilita;
drop policy if exists allow_all_prima_nota on public.prima_nota;
drop policy if exists allow_all_prima_nota_righe on public.prima_nota_righe;
drop policy if exists allow_all_partitario on public.partitario;
drop policy if exists allow_all_piano_conti on public.piano_conti;
drop policy if exists allow_all_causali_contabili on public.causali_contabili;
drop policy if exists allow_all_causali_iva on public.causali_iva;
drop policy if exists allow_all_percipienti on public.percipienti;
drop policy if exists allow_all_regole on public.regole_automatiche;
drop policy if exists allow_all_liq on public.liquidazione_iva;
drop policy if exists allow_all_liq_righe on public.liquidazioni_iva_righe;
drop policy if exists allow_all_f24 on public.f24;
drop policy if exists allow_all_beni on public.beni_ammortizzabili;
drop policy if exists allow_all_quote on public.quote_ammortamento;

create policy societa_select_policy on public.societa
for select
using (public.user_has_societa_access(id));

create policy societa_modify_policy on public.societa
for all
using (public.is_owner_or_admin() and public.user_has_societa_access(id))
with check (public.is_owner_or_admin());

create policy utenti_studio_self_or_owner_select on public.utenti_studio
for select
using (auth_user_id = auth.uid() or public.is_owner_or_admin());

create policy utenti_studio_owner_manage on public.utenti_studio
for all
using (public.current_utente_ruolo() = 'owner')
with check (public.current_utente_ruolo() = 'owner');

create policy utenti_studio_societa_self_select on public.utenti_studio_societa
for select
using (auth_user_id = auth.uid() or public.is_owner_or_admin());

create policy utenti_studio_societa_owner_manage on public.utenti_studio_societa
for all
using (public.current_utente_ruolo() = 'owner')
with check (public.current_utente_ruolo() = 'owner');

create policy clienti_select_policy on public.clienti
for select
using (public.user_can_access_cliente(id));

create policy clienti_modify_policy on public.clienti
for all
using (public.is_owner_or_admin() or public.user_can_access_cliente(id))
with check (public.is_owner_or_admin() or public.user_can_access_cliente(id));

create policy documenti_import_policy on public.documenti_import
for all
using (public.user_can_access_scoped_row(company_id, created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(company_id, created_by, owner_user_id));

create policy documenti_contabilita_policy on public.documenti_contabilita
for all
using (public.user_can_access_scoped_row(company_id, created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(company_id, created_by, owner_user_id));

create policy prima_nota_policy on public.prima_nota
for all
using (public.user_can_access_scoped_row(company_id, created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(company_id, created_by, owner_user_id));

create policy prima_nota_righe_policy on public.prima_nota_righe
for all
using (
  exists (
    select 1
    from public.prima_nota pn
    where pn.id = prima_nota_righe.prima_nota_id
      and public.user_can_access_scoped_row(
        coalesce(prima_nota_righe.company_id, pn.company_id, pn.societa_id),
        coalesce(prima_nota_righe.created_by, pn.created_by),
        coalesce(prima_nota_righe.owner_user_id, pn.owner_user_id),
        coalesce(prima_nota_righe.visibility, pn.visibility, 'shared')
      )
  )
)
with check (
  exists (
    select 1
    from public.prima_nota pn
    where pn.id = prima_nota_righe.prima_nota_id
      and public.user_can_write_scoped_row(
        coalesce(prima_nota_righe.company_id, pn.company_id, pn.societa_id),
        coalesce(prima_nota_righe.created_by, pn.created_by),
        coalesce(prima_nota_righe.owner_user_id, pn.owner_user_id)
      )
  )
);

create policy prima_nota_partitario_policy on public.partitario
for all
using (
  exists (
    select 1
    from public.prima_nota pn
    where pn.id = partitario.prima_nota_id
      and public.user_can_access_scoped_row(
        coalesce(partitario.company_id, pn.company_id, pn.societa_id),
        coalesce(partitario.created_by, pn.created_by),
        coalesce(partitario.owner_user_id, pn.owner_user_id),
        coalesce(partitario.visibility, pn.visibility, 'shared')
      )
  )
)
with check (
  exists (
    select 1
    from public.prima_nota pn
    where pn.id = partitario.prima_nota_id
      and public.user_can_write_scoped_row(
        coalesce(partitario.company_id, pn.company_id, pn.societa_id),
        coalesce(partitario.created_by, pn.created_by),
        coalesce(partitario.owner_user_id, pn.owner_user_id)
      )
  )
);

create policy accounting_entries_policy on public.accounting_entries
for all
using (public.user_can_access_scoped_row(coalesce(company_id, societa_id), created_by, owner_user_id, visibility))
with check (public.user_can_write_scoped_row(coalesce(company_id, societa_id), created_by, owner_user_id));

create policy registri_iva_policy on public.registri_iva
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy liquidazione_iva_policy on public.liquidazione_iva
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_piano_conti on public.piano_conti
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_causali_contabili on public.causali_contabili
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_causali_iva on public.causali_iva
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_percipienti on public.percipienti
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_regole on public.regole_automatiche
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

create policy societa_scoped_generic_policy_partitario on public.partitario
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

grant select, insert, update, delete on public.utenti_studio_societa to authenticated;
