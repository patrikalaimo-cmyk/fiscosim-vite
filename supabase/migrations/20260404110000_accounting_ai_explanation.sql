-- Testo breve spiegazione decisione Auto Validate (max ~200 caratteri lato app)

alter table public.accounting_entries
  add column if not exists ai_explanation text;

comment on column public.accounting_entries.ai_explanation is 'Spiegazione leggibile (≤200 char) del punteggio auto-validazione';
