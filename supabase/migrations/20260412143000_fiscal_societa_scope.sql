alter table if exists public.fiscal_outputs
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.accounting_entries
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.registri_iva
  add column if not exists societa_id uuid references public.societa(id);

alter table if exists public.liquidazione_iva
  add column if not exists societa_id uuid references public.societa(id);

update public.registri_iva ri
set societa_id = ae.societa_id
from public.accounting_entries ae
where ae.id = ri.accounting_entry_id
  and ae.societa_id is not null
  and ri.societa_id is null;

update public.liquidazione_iva li
set societa_id = src.societa_id
from (
  select
    liq.id,
    min(ri.societa_id::text)::uuid as societa_id
  from public.liquidazione_iva liq
  join public.registri_iva ri
    on ri.societa_id is not null
   and ri.data >= liq.periodo_inizio
   and ri.data <= liq.periodo_fine
  group by liq.id
  having count(distinct ri.societa_id) = 1
) src
where li.id = src.id
  and li.societa_id is null;

update public.fiscal_outputs fo
set societa_id = li.societa_id
from public.liquidazione_iva li
where li.id = fo.liquidazione_iva_id
  and li.societa_id is not null
  and fo.societa_id is null;

drop index if exists public.liquidazione_iva_unique_mensile;
drop index if exists public.liquidazione_iva_unique_trimestre;

create unique index if not exists liquidazione_iva_unique_mensile_societa
  on public.liquidazione_iva (societa_id, periodicita, anno, mese)
  where periodicita = 'mensile' and mese is not null and societa_id is not null;

create unique index if not exists liquidazione_iva_unique_trimestre_societa
  on public.liquidazione_iva (societa_id, periodicita, anno, trimestre)
  where periodicita = 'trimestrale' and trimestre is not null and societa_id is not null;

create index if not exists idx_liquidazione_iva_societa_periodo
  on public.liquidazione_iva (societa_id, periodo_fine desc);

create index if not exists idx_registri_iva_societa_data
  on public.registri_iva (societa_id, data);

create index if not exists idx_fiscal_outputs_societa_created
  on public.fiscal_outputs (societa_id, created_at desc);

create or replace function public.user_has_societa_access(target_societa uuid)
returns boolean
language plpgsql
stable
as $$
declare
  has_access boolean := false;
begin
  if target_societa is null or auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.utenti_studio_societa') is null then
    return false;
  end if;

  execute $sql$
    select exists (
      select 1
      from public.utenti_studio_societa uss
      where uss.auth_user_id = auth.uid()
        and uss.societa_id = $1
    )
  $sql$
  into has_access
  using target_societa;

  return coalesce(has_access, false);
end;
$$;

alter table if exists public.fiscal_outputs enable row level security;

drop policy if exists fiscal_outputs_policy on public.fiscal_outputs;

create policy fiscal_outputs_policy on public.fiscal_outputs
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));
