-- Insight proattivi da motori di analisi (IVA, trend costi, suggerimenti fiscali)

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null,
  tipo text not null,
  titolo text not null,
  descrizione text not null,
  gravita text not null,
  entity_ref jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint ai_insights_tipo_check check (
    tipo in ('iva_anomaly', 'cost_trend', 'fiscal_suggestion')
  ),
  constraint ai_insights_gravita_check check (
    gravita in ('info', 'warning', 'critical')
  ),
  constraint ai_insights_societa_fingerprint unique (societa_id, fingerprint)
);

create index if not exists idx_ai_insights_societa_created
  on public.ai_insights (societa_id, created_at desc);

create index if not exists idx_ai_insights_societa_tipo
  on public.ai_insights (societa_id, tipo);

comment on table public.ai_insights is 'Insight generati da scan contabile (anomalie IVA, trend, suggerimenti fiscali)';
comment on column public.ai_insights.tipo is 'iva_anomaly | cost_trend | fiscal_suggestion';
comment on column public.ai_insights.gravita is 'info | warning | critical';
comment on column public.ai_insights.entity_ref is 'Riferimento entità (document_id, conto_id, soggetto_piva, …)';
comment on column public.ai_insights.fingerprint is 'Chiave idempotente per società (evita duplicati su re-run)';

grant select, insert, update, delete on table public.ai_insights to anon, authenticated;
