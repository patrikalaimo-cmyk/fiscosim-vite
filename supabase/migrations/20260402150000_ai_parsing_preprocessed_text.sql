-- Testo passato al modello (dopo preprocess / sezioni) per debug e tuning qualità.
alter table public.ai_parsing_results
  add column if not exists preprocessed_text text,
  add column if not exists preprocessed_text_length integer;

comment on column public.ai_parsing_results.preprocessed_text is 'Corpo documento inviato al prompt AI (post-preprocess o sezioni); troncato se oltre limite app';
comment on column public.ai_parsing_results.preprocessed_text_length is 'Lunghezza originale stringa prima di eventuale troncamento su DB';
