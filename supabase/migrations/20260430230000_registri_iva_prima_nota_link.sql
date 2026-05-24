-- Migration: adatta registri_iva al workflow prima_nota
-- Il vecchio schema richiedeva accounting_entry_id NOT NULL → accounting_entries.
-- Il nuovo workflow usa prima_nota_id. Rendiamo accounting_entry_id nullable
-- e aggiungiamo prima_nota_id come FK opzionale.

-- 1. rende accounting_entry_id nullable
alter table public.registri_iva
  alter column accounting_entry_id drop not null;

-- 2. aggiunge prima_nota_id (nullable, FK a prima_nota)
alter table public.registri_iva
  add column if not exists prima_nota_id uuid
    references public.prima_nota(id) on delete set null;

create index if not exists idx_registri_iva_prima_nota_id
  on public.registri_iva(prima_nota_id);

-- 3. campi soggetto/documento per tracciabilità (tutti nullable)
alter table public.registri_iva
  add column if not exists numero_documento text,
  add column if not exists data_documento   date,
  add column if not exists soggetto_piva    text,
  add column if not exists soggetto_denominazione text,
  add column if not exists documento_contabilita_id uuid
    references public.documenti_contabilita(id) on delete set null;

create index if not exists idx_registri_iva_documento_contabilita_id
  on public.registri_iva(documento_contabilita_id);
