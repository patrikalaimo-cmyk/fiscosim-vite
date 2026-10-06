create table if not exists public.admin_reset_operations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  performed_by uuid null,
  role text null,
  societa_id uuid null references public.societa(id) on delete set null,
  action text not null,
  scope_type text null,
  scope_id text null,
  dry_run boolean not null default true,
  status text not null default 'preview',
  touched_count integer not null default 0,
  blocked_count integer not null default 0,
  skipped_count integer not null default 0,
  result_summary text not null default '',
  payload_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_admin_reset_operations_created_at
  on public.admin_reset_operations(created_at desc);

create index if not exists idx_admin_reset_operations_action
  on public.admin_reset_operations(action, created_at desc);

create index if not exists idx_admin_reset_operations_societa
  on public.admin_reset_operations(societa_id, created_at desc);

alter table if exists public.admin_reset_operations enable row level security;

drop policy if exists admin_reset_operations_owner_admin_read on public.admin_reset_operations;
create policy admin_reset_operations_owner_admin_read
on public.admin_reset_operations
for select
using (
  exists (
    select 1
    from public.utenti_studio us
    where us.auth_user_id = auth.uid()
      and us.attivo = true
      and lower(coalesce(us.ruolo, '')) in ('owner', 'admin')
  )
);

drop policy if exists admin_reset_operations_owner_admin_insert on public.admin_reset_operations;
create policy admin_reset_operations_owner_admin_insert
on public.admin_reset_operations
for insert
with check (
  exists (
    select 1
    from public.utenti_studio us
    where us.auth_user_id = auth.uid()
      and us.attivo = true
      and lower(coalesce(us.ruolo, '')) in ('owner', 'admin')
  )
);
