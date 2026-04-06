-- Regole apprese: anagrafica (conto piano) → conto costo/ricavo scelto dall'operatore
-- Aggiornamento atomico su feedback (evita duplicati su stessa coppia anagrafica_id + conto_id)

create table if not exists public.ai_learning (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null,
  anagrafica_id uuid not null references public.piano_conti (id) on delete cascade,
  conto_id uuid not null references public.piano_conti (id) on delete cascade,
  frequenza integer not null default 1,
  confidence_score numeric(7, 2) not null default 0,
  ultimo_utilizzo timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ai_learning_anagrafica_conto_key unique (anagrafica_id, conto_id)
);

create index if not exists idx_ai_learning_societa on public.ai_learning (societa_id);
create index if not exists idx_ai_learning_ultimo on public.ai_learning (ultimo_utilizzo desc);

comment on table public.ai_learning is 'Apprendimento da feedback: associazione anagrafica → conto (frequenza e confidence)';
comment on column public.ai_learning.conto_id is 'Conto costo/ricavo confermato o corretto dall''operatore';
comment on column public.ai_learning.confidence_score is 'Punteggio cumulativo (max 100): +20 correzione, +5 conferma';

-- Inserimento o incremento in un solo passaggio (anti-duplicato)
create or replace function public.apply_ai_learning_from_feedback(
  p_societa_id uuid,
  p_anagrafica_id uuid,
  p_conto_id uuid,
  p_delta numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_societa_id is null or p_anagrafica_id is null or p_conto_id is null or p_delta is null then
    return;
  end if;

  insert into public.ai_learning (
    societa_id,
    anagrafica_id,
    conto_id,
    frequenza,
    confidence_score,
    ultimo_utilizzo
  ) values (
    p_societa_id,
    p_anagrafica_id,
    p_conto_id,
    1,
    least(100::numeric, p_delta),
    now()
  )
  on conflict (anagrafica_id, conto_id) do update set
    frequenza = public.ai_learning.frequenza + 1,
    confidence_score = least(100::numeric, public.ai_learning.confidence_score + p_delta),
    ultimo_utilizzo = now();
end;
$$;

comment on function public.apply_ai_learning_from_feedback is 'Upsert ai_learning: nuova riga o +frequenza e +confidence (cap 100)';

grant select, insert, update, delete on table public.ai_learning to anon, authenticated;
grant execute on function public.apply_ai_learning_from_feedback(uuid, uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.apply_ai_learning_from_feedback(uuid, uuid, uuid, numeric) to service_role;
