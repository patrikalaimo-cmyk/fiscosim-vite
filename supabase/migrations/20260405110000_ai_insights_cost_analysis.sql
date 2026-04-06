-- Consenti tipo insight cost_analysis (aggregati mese/categoria/fornitore)

alter table public.ai_insights drop constraint if exists ai_insights_tipo_check;

alter table public.ai_insights
  add constraint ai_insights_tipo_check check (
    tipo in (
      'iva_anomaly',
      'cost_trend',
      'fiscal_suggestion',
      'cost_analysis'
    )
  );

comment on column public.ai_insights.tipo is 'iva_anomaly | cost_trend | fiscal_suggestion | cost_analysis';
