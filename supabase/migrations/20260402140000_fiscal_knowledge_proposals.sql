-- Batch di proposte aggiornamento regole IA (revisione owner/admin prima di applicare a fiscal_knowledge)

create table if not exists public.fiscal_knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'applied', 'discarded')),
  title text,
  notes text,
  sources_summary text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by_user_id uuid,
  scan_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.fiscal_knowledge_proposal_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fiscal_knowledge_proposals(id) on delete cascade,
  sort_order int not null default 0,
  categoria text not null,
  chiave text not null,
  valore text not null default '',
  contesto text,
  valido_dal date,
  valido_al date,
  descrizione text,
  metadata jsonb not null default '{}'::jsonb,
  source_url text,
  source_label text,
  proposed_action text not null default 'add' check (proposed_action in ('add', 'update', 'deactivate')),
  target_fiscal_knowledge_id uuid
);

create index if not exists idx_fk_proposals_status on public.fiscal_knowledge_proposals (status, created_at desc);
create index if not exists idx_fk_proposal_items_batch on public.fiscal_knowledge_proposal_items (batch_id, sort_order);

-- Una decisione per voce (bozza condivisa tra owner/admin fino ad Applica)
create table if not exists public.fiscal_knowledge_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_item_id uuid not null references public.fiscal_knowledge_proposal_items(id) on delete cascade,
  decision text not null check (decision in ('approve', 'reject')),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  unique (proposal_item_id)
);

create index if not exists idx_fk_decisions_item on public.fiscal_knowledge_proposal_decisions (proposal_item_id);

comment on table public.fiscal_knowledge_proposals is 'Verifiche periodiche regole IA: notifica owner/admin fino a revisione completa';
comment on table public.fiscal_knowledge_proposal_items is 'Singole proposte da confermare/annullare prima di scrivere su fiscal_knowledge';
comment on table public.fiscal_knowledge_proposal_decisions is 'Decisioni bozza per voce; Applica richiede tutte le voci decise';

grant select, insert, update, delete on table public.fiscal_knowledge_proposals to anon, authenticated;
grant select, insert, update, delete on table public.fiscal_knowledge_proposal_items to anon, authenticated;
grant select, insert, update, delete on table public.fiscal_knowledge_proposal_decisions to anon, authenticated;
