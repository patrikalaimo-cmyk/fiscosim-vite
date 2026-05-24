alter table if exists public.documenti_import
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.documenti_contabilita
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.prima_nota
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.prima_nota_righe
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.partitario
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.revisioni_dichiarativi
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.accounting_entries
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

alter table if exists public.ai_learning
  add column if not exists tenant_id uuid,
  add column if not exists company_id uuid,
  add column if not exists created_by uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;
