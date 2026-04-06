-- Feedback operatore: conto predetto (pipeline) vs conto finale (documento / prima nota)

create table if not exists public.ai_feedback_log (
  id uuid primary key default gen_random_uuid(),
  prima_nota_riga_id uuid references public.prima_nota_righe (id) on delete set null,
  conto_predetto uuid references public.piano_conti (id) on delete set null,
  conto_corretto uuid references public.piano_conti (id) on delete set null,
  anagrafica_id uuid references public.piano_conti (id) on delete set null,
  tipo text not null,
  created_at timestamptz not null default now(),
  constraint ai_feedback_log_tipo_check check (tipo in ('correzione', 'conferma'))
);

create index if not exists idx_ai_feedback_log_created on public.ai_feedback_log (created_at desc);
create index if not exists idx_ai_feedback_log_prima_nota_riga on public.ai_feedback_log (prima_nota_riga_id);

comment on table public.ai_feedback_log is 'Confronto conto AI vs scelta operatore (conferma/correzione)';
comment on column public.ai_feedback_log.prima_nota_riga_id is 'Riga PN costo/ricavo se già registrata; altrimenti null';
comment on column public.ai_feedback_log.anagrafica_id is 'Conto piano collegato a P.IVA fornitore/cliente, se presente';

grant select, insert, update, delete on table public.ai_feedback_log to anon, authenticated;
