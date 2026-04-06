-- Stato utente su insight Copilot (visti / risolti)

alter table public.ai_insights
  add column if not exists seen_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_ai_insights_societa_unresolved
  on public.ai_insights (societa_id, created_at desc)
  where resolved_at is null;

comment on column public.ai_insights.seen_at is 'Utente ha aperto i dettagli o segnato come visto';
comment on column public.ai_insights.resolved_at is 'Utente ha segnato come risolto (dismiss / corretto)';
