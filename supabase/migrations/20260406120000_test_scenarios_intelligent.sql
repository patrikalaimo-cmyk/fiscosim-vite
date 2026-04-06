-- Idempotente: lo schema completo è in 20260405150000_test_scenarios.sql.
-- Per progetti dove la 051500 era vecchia (senza kind/critical_tags), aggiunge le colonne.

alter table public.test_scenarios
  add column if not exists critical_tags text[] not null default '{}'::text[];

alter table public.test_scenarios
  add column if not exists kind text not null default 'standard';

alter table public.test_scenarios
  drop constraint if exists test_scenarios_kind_check;

alter table public.test_scenarios
  add constraint test_scenarios_kind_check check (kind in ('standard', 'intelligent'));
