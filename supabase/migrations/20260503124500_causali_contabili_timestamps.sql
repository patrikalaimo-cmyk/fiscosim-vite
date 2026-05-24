alter table if exists public.causali_contabili
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.causali_contabili
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.set_updated_at_causali_contabili()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_causali_contabili_set_updated_at on public.causali_contabili;
create trigger trg_causali_contabili_set_updated_at
before update on public.causali_contabili
for each row
execute function public.set_updated_at_causali_contabili();
