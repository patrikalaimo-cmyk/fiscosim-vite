-- Legacy compatibility table for local Supabase bootstrap only.
-- This table exists to satisfy older FK/policy migrations that still reference public.clienti.
-- Do not use this as the new operational model.

create table if not exists public.clienti (
  id uuid primary key default gen_random_uuid()
);

comment on table public.clienti is 'Legacy compatibility table for local bootstrap; retained only for older FK/policy migrations.';