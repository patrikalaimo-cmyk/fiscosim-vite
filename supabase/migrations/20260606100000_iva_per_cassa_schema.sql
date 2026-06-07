alter table public.registri_iva
  add column if not exists esigibilita text not null default 'immediata';

do $$
begin
  alter table public.registri_iva
    add constraint registri_iva_esigibilita_check
    check (esigibilita in ('immediata', 'differita', 'rilascio'));
exception
  when duplicate_object then null;
end $$;

alter table public.registri_iva
  add column if not exists origin_registro_iva_id uuid;

do $$
begin
  alter table public.registri_iva
    add constraint registri_iva_origin_registro_iva_id_fkey
    foreign key (origin_registro_iva_id)
    references public.registri_iva(id)
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

alter table public.partitario
  add column if not exists iva_per_cassa boolean not null default false;

create index if not exists idx_registri_iva_esigibilita
  on public.registri_iva(esigibilita);

create index if not exists idx_registri_iva_origin_registro_iva_id
  on public.registri_iva(origin_registro_iva_id);

create index if not exists idx_partitario_iva_per_cassa
  on public.partitario(iva_per_cassa);

