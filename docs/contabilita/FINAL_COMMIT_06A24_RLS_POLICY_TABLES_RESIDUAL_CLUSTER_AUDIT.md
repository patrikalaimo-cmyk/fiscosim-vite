# FINAL-COMMIT-06A.24 - Audit cluster residuo RLS/policy tables

## Scopo

Audit completo della migration [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) per estrarre tutte le tabelle `public.X` citate in `drop policy`, `create policy`, `alter table`, `update` e riferimenti inline, e decidere se serve un bootstrap cluster unico.

## File letti

- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [supabase/migrations/**/*.sql](../../supabase/migrations)
- [schema.sql](../../schema.sql)
- [schema_v3.sql](../../schema_v3.sql)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [FINAL_COMMIT_06A17_GLOBAL_MIGRATION_GRAPH_AUDIT.md](FINAL_COMMIT_06A17_GLOBAL_MIGRATION_GRAPH_AUDIT.md)
- [FINAL_COMMIT_06A23_F24_BASE_BOOTSTRAP.md](FINAL_COMMIT_06A23_F24_BASE_BOOTSTRAP.md)
- [supabase/config.toml](../../supabase/config.toml)
- [package.json](../../package.json)

## Audit completo della migration RLS

| Tabella | Operazioni trovate | Contesto | Create table nelle migrations? | Create table prima della RLS? | Esiste in schema legacy? | Stato |
|---|---|---|---|---|---|---|
| `public.utenti_studio_societa` | `create table`, `create index`, `create trigger`-support later | Testata bootstrap relazione auth/societa all'inizio del file | Sì | Sì, stessa migration prima di altri usi | Sì, nel grafo | OK |
| `public.documenti_contabilita` | `alter table ... set default`, `enable row level security`, `drop policy`, `create policy` | Scope AI / contabilità | Sì | Sì, bootstrap [20260412090000_documenti_contabilita_base_bootstrap.sql](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql) | Sì | OK |
| `public.prima_nota` | `alter table ... set default`, `enable row level security`, `drop policy`, `create policy` | Scope contabile | Sì | Sì, bootstrap [20260404190000_prima_nota_base_bootstrap.sql](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql) | Sì | OK |
| `public.prima_nota_righe` | `alter table ... set default`, `enable row level security`, `drop policy`, `create policy` | Scope contabile | Sì | Sì, bootstrap [20260404190000_prima_nota_base_bootstrap.sql](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql) | Sì | OK |
| `public.partitario` | `alter table ... set default`, `enable row level security`, `drop policy`, `create policy` | Partitario / scadenze | Sì | Sì, bootstrap [20260412091000_partitario_base_bootstrap.sql](../../supabase/migrations/20260412091000_partitario_base_bootstrap.sql) | Sì | OK |
| `public.documenti_import` | `alter table ... set default`, `create trigger`, `enable row level security`, `create policy` | Access scope / import | Sì | Sì, bootstrap [20260412090500_access_scope_base_tables_bootstrap.sql](../../supabase/migrations/20260412090500_access_scope_base_tables_bootstrap.sql) | No nei legacy controllati | OK |
| `public.accounting_entries` | `alter table add column`, `enable row level security`, `create policy` | Scope accounting entries | Sì | Sì, base grafo precedente | Sì | OK |
| `public.registri_iva` | `alter table add column`, `enable row level security`, `create policy` | Scope IVA | Sì | Sì, [20260403150000_registri_iva.sql](../../supabase/migrations/20260403150000_registri_iva.sql) | Sì | OK |
| `public.liquidazione_iva` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Scope liquidazione IVA | Sì | Sì, [20260403160000_liquidazione_iva.sql](../../supabase/migrations/20260403160000_liquidazione_iva.sql) | Sì | OK |
| `public.piano_conti` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Scope conti | Sì | Sì, [20260403140000_mastrini_bilancio.sql](../../supabase/migrations/20260403140000_mastrini_bilancio.sql) | Sì | OK |
| `public.causali_contabili` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Fiscal/accounting cluster | Sì | Sì, bootstrap [20260412125000_accounting_fiscal_base_tables_bootstrap.sql](../../supabase/migrations/20260412125000_accounting_fiscal_base_tables_bootstrap.sql) | Sì | OK |
| `public.causali_iva` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Fiscal/accounting cluster | Sì | Sì, bootstrap [20260412125000_accounting_fiscal_base_tables_bootstrap.sql](../../supabase/migrations/20260412125000_accounting_fiscal_base_tables_bootstrap.sql) | Sì | OK |
| `public.percipienti` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Fiscal/accounting cluster | Sì | Sì, bootstrap [20260412125000_accounting_fiscal_base_tables_bootstrap.sql](../../supabase/migrations/20260412125000_accounting_fiscal_base_tables_bootstrap.sql) | Sì | OK |
| `public.regole_automatiche` | `alter table add column`, `enable row level security`, `drop policy`, `create policy` | Regole AI / fiscal automation | Sì | Sì, bootstrap [20260412125500_regole_automatiche_base_bootstrap.sql](../../supabase/migrations/20260412125500_regole_automatiche_base_bootstrap.sql) | Sì | OK |
| `public.clienti` | `enable row level security`, `drop policy`, `create policy` | Access/customer policy chain | Sì | Sì, legacy compat / graphed earlier | Sì | OK |
| `public.societa` | `enable row level security`, `drop policy`, `create policy` | Tenant scope root | Sì | Sì, [20260412124000_societa_base_bootstrap.sql](../../supabase/migrations/20260412124000_societa_base_bootstrap.sql) | Sì | OK |
| `public.utenti_studio` | `enable row level security`, `drop policy`, `create policy` | Auth/profile root | Sì | Sì, [20260412110000_utenti_studio_base_bootstrap.sql](../../supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql) | Sì | OK |
| `public.liquidazioni_iva_righe` | `drop policy` | Residual fiscal RLS blocker | Sì | Sì, bootstrap [20260412125600_liquidazioni_iva_righe_base_bootstrap.sql](../../supabase/migrations/20260412125600_liquidazioni_iva_righe_base_bootstrap.sql) | Sì, solo schema v3 | OK |
| `public.f24` | `drop policy` | Residual fiscal RLS blocker | Sì | Sì, bootstrap [20260412125700_f24_base_bootstrap.sql](../../supabase/migrations/20260412125700_f24_base_bootstrap.sql) | Sì, solo schema v3 | OK |
| `public.beni_ammortizzabili` | `drop policy` | Residual fiscal RLS blocker | No | No | Sì, solo schema v3 | LEGACY ONLY |
| `public.quote_ammortamento` | `drop policy` | Residual fiscal RLS blocker | No | No | Sì, solo schema v3 | LEGACY ONLY |

## Verifica delle domande

1. La migration che continua a toccare il cluster residuo è [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).
2. `public.beni_ammortizzabili` e `public.quote_ammortamento` non risultano create da una migration Supabase prima del fix.
3. Le due tabelle esistono nello schema legacy [schema_v3.sql](../../schema_v3.sql), non in [schema.sql](../../schema.sql) né in [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql).
4. La relazione è fiscale/asset management; `quote_ammortamento` referenzia `beni_ammortizzabili` nel legacy con FK, ma il bootstrap locale evita FK premature.
5. Sì, conviene evitare FK verso `clienti` o verso `beni_ammortizzabili` nel bootstrap, per non aprire una nuova dipendenza anticipata.
6. Le policy successive non citano `societa_id` per queste due tabelle; la chain attuale si ferma già sul `drop policy`, quindi un bootstrap minimale basta.

## Decisione

Non serve più correggere una tabella alla volta per questo ramo: il cluster residuo si è ridotto a due sole tabelle legacy-only. Per questo ho creato una sola migration cluster.

## File creato per il cluster

- [supabase/migrations/20260412125800_residual_rls_policy_tables_bootstrap.sql](../../supabase/migrations/20260412125800_residual_rls_policy_tables_bootstrap.sql)

## Colonne minime del cluster

### `public.beni_ammortizzabili`

- `id`
- `cliente_id`
- `cliente_nome`
- `descrizione`
- `categoria`
- `data_acquisto`
- `costo_storico`
- `aliquota_ammortamento`
- `fondo_ammortamento`
- `valore_residuo`
- `anni_vita_utile`
- `note`
- `attivo`
- `created_at`

### `public.quote_ammortamento`

- `id`
- `bene_id`
- `anno`
- `quota_annua`
- `fondo_progressivo`
- `valore_residuo`

## Diagnosi causa

La causa residua è `LEGACY ONLY`: le tabelle esistono nello schema v3, ma non erano state materializzate nel grafo migration locale prima della RLS policy chain.

## Rischi

- Dopo il bootstrap cluster potrebbero emergere altri blocker non coperti dal ramo fiscale residuale.
- `quote_ammortamento` resta volutamente senza FK per non introdurre dipendenze premature.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration RLS esistente è stata modificata.

## Verdetto

**FINAL-COMMIT-06A.24: A**

L'audit è completo abbastanza da mostrare che il residuo è un cluster piccolo e coerente. Il fix minimo è una sola migration bootstrap per le due tabelle legacy-only ancora mancanti.