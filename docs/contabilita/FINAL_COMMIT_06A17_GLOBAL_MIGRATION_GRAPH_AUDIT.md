# FINAL-COMMIT-06A.17 - Audit globale grafo migration Supabase

## Scopo

Audit statico del grafo migration Supabase per individuare tutte le tabelle usate prima di essere create, distinguere i casi già risolti e i blocker ancora aperti, senza toccare il DB o applicare migration.

## Vincoli rispettati

- Nessun `npx supabase start` eseguito.
- Nessun `db push`, `db reset` o `migration up` eseguito.
- Nessun SQL live eseguito.
- Nessuna migration applicata.
- Nessun file UI o modulo contabile modificato.
- Nessuna migration RPC modificata.

## Migration analizzate

Sono state analizzate 50 migration in ordine cronologico:

| Timestamp | File |
|---|---|
| 20260402100000 | [supabase/migrations/20260402100000_ai_pipeline_tables.sql](../../supabase/migrations/20260402100000_ai_pipeline_tables.sql) |
| 20260402120000 | [supabase/migrations/20260402120000_fiscal_knowledge.sql](../../supabase/migrations/20260402120000_fiscal_knowledge.sql) |
| 20260402140000 | [supabase/migrations/20260402140000_fiscal_knowledge_proposals.sql](../../supabase/migrations/20260402140000_fiscal_knowledge_proposals.sql) |
| 20260402150000 | [supabase/migrations/20260402150000_ai_parsing_preprocessed_text.sql](../../supabase/migrations/20260402150000_ai_parsing_preprocessed_text.sql) |
| 20260402160000 | [supabase/migrations/20260402160000_supplier_templates.sql](../../supabase/migrations/20260402160000_supplier_templates.sql) |
| 20260402200000 | [supabase/migrations/20260402200000_ai_parsing_layout_hash.sql](../../supabase/migrations/20260402200000_ai_parsing_layout_hash.sql) |
| 20260402210000 | [supabase/migrations/20260402210000_ai_document_memory.sql](../../supabase/migrations/20260402210000_ai_document_memory.sql) |
| 20260402220000 | [supabase/migrations/20260402220000_ai_document_memory_pipeline.sql](../../supabase/migrations/20260402220000_ai_document_memory_pipeline.sql) |
| 20260402230000 | [supabase/migrations/20260402230000_ai_document_memory_source_document.sql](../../supabase/migrations/20260402230000_ai_document_memory_source_document.sql) |
| 20260403110000 | [supabase/migrations/20260403110000_legacy_clienti_compat.sql](../../supabase/migrations/20260403110000_legacy_clienti_compat.sql) |
| 20260403120000 | [supabase/migrations/20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) |
| 20260403140000 | [supabase/migrations/20260403140000_mastrini_bilancio.sql](../../supabase/migrations/20260403140000_mastrini_bilancio.sql) |
| 20260403150000 | [supabase/migrations/20260403150000_registri_iva.sql](../../supabase/migrations/20260403150000_registri_iva.sql) |
| 20260403160000 | [supabase/migrations/20260403160000_liquidazione_iva.sql](../../supabase/migrations/20260403160000_liquidazione_iva.sql) |
| 20260403170000 | [supabase/migrations/20260403170000_fiscal_outputs.sql](../../supabase/migrations/20260403170000_fiscal_outputs.sql) |
| 20260404100000 | [supabase/migrations/20260404100000_accounting_entries_auto_validate.sql](../../supabase/migrations/20260404100000_accounting_entries_auto_validate.sql) |
| 20260404110000 | [supabase/migrations/20260404110000_accounting_ai_explanation.sql](../../supabase/migrations/20260404110000_accounting_ai_explanation.sql) |
| 20260404190000 | [supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql) |
| 20260404200000 | [supabase/migrations/20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql) |
| 20260404210000 | [supabase/migrations/20260404210000_ai_learning.sql](../../supabase/migrations/20260404210000_ai_learning.sql) |
| 20260404220000 | [supabase/migrations/20260404220000_accounting_ai_source_learning.sql](../../supabase/migrations/20260404220000_accounting_ai_source_learning.sql) |
| 20260405100000 | [supabase/migrations/20260405100000_ai_insights.sql](../../supabase/migrations/20260405100000_ai_insights.sql) |
| 20260405110000 | [supabase/migrations/20260405110000_ai_insights_cost_analysis.sql](../../supabase/migrations/20260405110000_ai_insights_cost_analysis.sql) |
| 20260405120000 | [supabase/migrations/20260405120000_ai_insights_seen_resolved.sql](../../supabase/migrations/20260405120000_ai_insights_seen_resolved.sql) |
| 20260405140000 | [supabase/migrations/20260405140000_pipeline_runs.sql](../../supabase/migrations/20260405140000_pipeline_runs.sql) |
| 20260405150000 | [supabase/migrations/20260405150000_test_scenarios.sql](../../supabase/migrations/20260405150000_test_scenarios.sql) |
| 20260406120000 | [supabase/migrations/20260406120000_test_scenarios_intelligent.sql](../../supabase/migrations/20260406120000_test_scenarios_intelligent.sql) |
| 20260406140000 | [supabase/migrations/20260406140000_test_scenarios_default_e2e.sql](../../supabase/migrations/20260406140000_test_scenarios_default_e2e.sql) |
| 20260407150000 | [supabase/migrations/20260407150000_test_scenarios_soft_expected_align.sql](../../supabase/migrations/20260407150000_test_scenarios_soft_expected_align.sql) |
| 20260412090000 | [supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql) |
| 20260412091000 | [supabase/migrations/20260412091000_partitario_base_bootstrap.sql](../../supabase/migrations/20260412091000_partitario_base_bootstrap.sql) |
| 20260412093000 | [supabase/migrations/20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql) |
| 20260412110000 | [supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql](../../supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql) |
| 20260412113000 | [supabase/migrations/20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) |
| 20260412124000 | [supabase/migrations/20260412124000_societa_base_bootstrap.sql](../../supabase/migrations/20260412124000_societa_base_bootstrap.sql) |
| 20260412130000 | [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) |
| 20260412143000 | [supabase/migrations/20260412143000_fiscal_societa_scope.sql](../../supabase/migrations/20260412143000_fiscal_societa_scope.sql) |
| 20260412153000 | [supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql) |
| 20260413103000 | [supabase/migrations/20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql) |
| 20260413121500 | [supabase/migrations/20260413121500_auth_scope_membership_recovery.sql](../../supabase/migrations/20260413121500_auth_scope_membership_recovery.sql) |
| 20260413143000 | [supabase/migrations/20260413143000_auth_session_profile_consolidation.sql](../../supabase/migrations/20260413143000_auth_session_profile_consolidation.sql) |
| 20260414170000 | [supabase/migrations/20260414170000_admin_reset_operations.sql](../../supabase/migrations/20260414170000_admin_reset_operations.sql) |
| 20260430220000 | [supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql](../../supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql) |
| 20260430230000 | [supabase/migrations/20260430230000_registri_iva_prima_nota_link.sql](../../supabase/migrations/20260430230000_registri_iva_prima_nota_link.sql) |
| 20260503123000 | [supabase/migrations/20260503123000_causali_contabili_config_columns.sql](../../supabase/migrations/20260503123000_causali_contabili_config_columns.sql) |
| 20260503124500 | [supabase/migrations/20260503124500_causali_contabili_timestamps.sql](../../supabase/migrations/20260503124500_causali_contabili_timestamps.sql) |
| 20260503130000 | [supabase/migrations/20260503130000_causali_contabili_righe_template.sql](../../supabase/migrations/20260503130000_causali_contabili_righe_template.sql) |
| 20260503135500 | [supabase/migrations/20260503135500_causali_iva_detail_columns.sql](../../supabase/migrations/20260503135500_causali_iva_detail_columns.sql) |
| 20260504102000 | [supabase/migrations/20260504102000_causali_iva_note_column.sql](../../supabase/migrations/20260504102000_causali_iva_note_column.sql) |
| 20260508140000 | [supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql) |

## Tabelle create dalle migration

| Timestamp | File | Tabelle create |
|---|---|---|
| 20260402100000 | [ai_pipeline_tables](../../supabase/migrations/20260402100000_ai_pipeline_tables.sql) | `ai_parsing_results`, `ai_logs`, `accounting_entries` |
| 20260402120000 | [fiscal_knowledge](../../supabase/migrations/20260402120000_fiscal_knowledge.sql) | `fiscal_knowledge` |
| 20260402140000 | [fiscal_knowledge_proposals](../../supabase/migrations/20260402140000_fiscal_knowledge_proposals.sql) | `fiscal_knowledge_proposals`, `proposal_items`, `proposal_decisions` |
| 20260402160000 | [supplier_templates](../../supabase/migrations/20260402160000_supplier_templates.sql) | `supplier_templates`, `supplier_parse_counts` |
| 20260402210000 | [ai_document_memory](../../supabase/migrations/20260402210000_ai_document_memory.sql) | `ai_document_memory` |
| 20260402220000 | [ai_document_memory_pipeline](../../supabase/migrations/20260402220000_ai_document_memory_pipeline.sql) | `ai_pipeline_counter` |
| 20260403110000 | [legacy_clienti_compat](../../supabase/migrations/20260403110000_legacy_clienti_compat.sql) | `clienti` |
| 20260403120000 | [partitari](../../supabase/migrations/20260403120000_partitari.sql) | `partitari` |
| 20260403140000 | [mastrini_bilancio](../../supabase/migrations/20260403140000_mastrini_bilancio.sql) | `piano_conti`, views `v_accounting_entry_righe`, `mastrini`, `bilancio_*` |
| 20260403150000 | [registri_iva](../../supabase/migrations/20260403150000_registri_iva.sql) | `registri_iva` |
| 20260403160000 | [liquidazione_iva](../../supabase/migrations/20260403160000_liquidazione_iva.sql) | `liquidazione_iva` |
| 20260403170000 | [fiscal_outputs](../../supabase/migrations/20260403170000_fiscal_outputs.sql) | `fiscal_outputs` |
| 20260404190000 | [prima_nota_base_bootstrap](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql) | `prima_nota`, `prima_nota_righe` |
| 20260404200000 | [ai_feedback_log](../../supabase/migrations/20260404200000_ai_feedback_log.sql) | `ai_feedback_log` |
| 20260404210000 | [ai_learning](../../supabase/migrations/20260404210000_ai_learning.sql) | `ai_learning` |
| 20260405100000 | [ai_insights](../../supabase/migrations/20260405100000_ai_insights.sql) | `ai_insights` |
| 20260405140000 | [pipeline_runs](../../supabase/migrations/20260405140000_pipeline_runs.sql) | `pipeline_runs`, `pipeline_steps` |
| 20260405150000 | [test_scenarios](../../supabase/migrations/20260405150000_test_scenarios.sql) | `test_scenarios` |
| 20260412090000 | [documenti_contabilita_base_bootstrap](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql) | `documenti_contabilita` |
| 20260412091000 | [partitario_base_bootstrap](../../supabase/migrations/20260412091000_partitario_base_bootstrap.sql) | `partitario` |
| 20260412110000 | [utenti_studio_base_bootstrap](../../supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql) | `utenti_studio` |
| 20260412124000 | [societa_base_bootstrap](../../supabase/migrations/20260412124000_societa_base_bootstrap.sql) | `societa` |
| 20260412130000 | [rls_multi_tenant_isolation](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) | `utenti_studio_societa` |
| 20260414170000 | [admin_reset_operations](../../supabase/migrations/20260414170000_admin_reset_operations.sql) | `admin_reset_operations` |
| 20260508140000 | [core_commit_canonical_accounting_payload](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql) | `canonical_accounting_commit_audit` |

## Tabelle referenziate dalle migration

### OK: create prima dell'uso

| Tabella | Prima creazione | Primo uso |
|---|---|---|
| `clienti` | 20260403110000 | 20260403120000 `partitari` |
| `accounting_entries` | 20260402100000 | 20260403150000 `registri_iva` |
| `liquidazione_iva` | 20260403160000 | 20260403170000 `fiscal_outputs` |
| `prima_nota` | 20260404190000 | 20260404190000 `prima_nota_base_bootstrap` (same migration) |
| `prima_nota_righe` | 20260404190000 | 20260404190000 `prima_nota_base_bootstrap` (same migration) |
| `ai_feedback_log` | 20260404200000 | 20260404200000 `ai_feedback_log` |
| `piano_conti` | 20260403140000 | 20260404200000 `ai_feedback_log` / `20260404210000 ai_learning` |
| `pipeline_runs` | 20260405140000 | 20260405140000 `pipeline_steps` |
| `documenti_contabilita` | 20260412090000 | 20260430220000 `prima_nota_documento_contabilita_link` |
| `partitario` | 20260412091000 | 20260412093000 `access_scope_columns` / 20260412130000 `rls_multi_tenant_isolation` |
| `utenti_studio` | 20260412110000 | 20260412130000 `utenti_studio_societa` |
| `societa` | 20260412124000 | 20260412130000 `utenti_studio_societa` |

### CREATA DOPO USO

| Stato | Esito |
|---|---|
| Backward create-after-use | Nessun caso confermato nelle migration analizzate |

### MAI CREATA NELLE MIGRATION

| Tabella | Primo uso nella migration graph | Presenza schema legacy | Classificazione |
|---|---|---|---|
| `documenti_import` | 20260412093000 `access_scope_columns` | Non trovata negli schema analizzati | MISSING nel grafo e negli schema controllati |
| `revisioni_dichiarativi` | 20260412093000 `access_scope_columns` | Non trovata negli schema analizzati | MISSING nel grafo e negli schema controllati |
| `causali_contabili` | 20260412130000 `rls_multi_tenant_isolation` | Presente in [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema legacy |
| `causali_iva` | 20260412130000 `rls_multi_tenant_isolation` | Presente in [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema legacy |
| `percipienti` | 20260412130000 `rls_multi_tenant_isolation` | Presente in [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema legacy |

### PRESENTE SOLO NEGLI SCHEMA LEGACY

| Tabella | Schema di origine | Note |
|---|---|---|
| `coda_import_fatture` | [schema_contabilita.sql](../../schema_contabilita.sql) | Definita nello schema legacy ma non materializzata nelle migration |
| `ai_proposte` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `prima_nota_iva` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `ritenute` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `certificazioni_uniche` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `bulk_operations` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `regole_automatiche` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `corrispettivi` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Solo schema completo |
| `liquidazioni_iva` | [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) | Divergenza di naming rispetto alla migration singolare `liquidazione_iva` |

## Bootstrap già aggiunti nel branch

| Timestamp | File | Note |
|---|---|---|
| 20260403110000 | [legacy_clienti_compat.sql](../../supabase/migrations/20260403110000_legacy_clienti_compat.sql) | Bootstrap compat `clienti` |
| 20260404190000 | [prima_nota_base_bootstrap.sql](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql) | Bootstrap `prima_nota` e `prima_nota_righe` |
| 20260412090000 | [documenti_contabilita_base_bootstrap.sql](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql) | Bootstrap `documenti_contabilita` |
| 20260412091000 | [partitario_base_bootstrap.sql](../../supabase/migrations/20260412091000_partitario_base_bootstrap.sql) | Bootstrap `partitario` singolare |
| 20260412110000 | [utenti_studio_base_bootstrap.sql](../../supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql) | Bootstrap `utenti_studio` |
| 20260412124000 | [societa_base_bootstrap.sql](../../supabase/migrations/20260412124000_societa_base_bootstrap.sql) | Bootstrap `societa` |

## Possibili prossimi blocker

### Blocker attuali del grafo

1. `documenti_import` e `revisioni_dichiarativi` in [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql).
2. `causali_contabili`, `causali_iva`, `percipienti` in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).

### Blocker latenti di allineamento schema

1. `coda_import_fatture` se qualche futura migration lo assumerà già presente.
2. `ai_proposte`, `prima_nota_iva`, `ritenute`, `certificazioni_uniche`, `bulk_operations`, `regole_automatiche`, `corrispettivi` se lo schema completo verrà portato nel grafo migration.

## Proposta di fix raggruppata

Per i blocker attuali, il fix minimo non va fatto uno alla volta oltre il necessario. Ha più senso raggruppare così:

1. Una migration base per `documenti_import` e `revisioni_dichiarativi` prima di `20260412093000_access_scope_columns.sql`.
2. Una migration base per `causali_contabili`, `causali_iva`, `percipienti` prima di `20260412130000_rls_multi_tenant_isolation.sql`.

Le tabelle solo legacy-schema possono restare in coda come gap di allineamento, ma non sono tutte blocker immediati del bootstrap corrente.

## Raccomandazione

La raccomandazione è continuare con fix raggruppati e mirati, non con fix singoli uno per uno. Il grafo non è da fermare, ma è abbastanza frammentato da richiedere un riordino per cluster di dipendenze, non solo reazioni ai singoli errori di `npx supabase start`.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL è stato eseguito.
- Nessuna migration è stata applicata.

## Verdetto

**FINAL-COMMIT-06A.17: A**

L'audit è completo abbastanza da identificare i prossimi blocker del grafo e distinguere quelli attuali da quelli solo legacy-schema. Il ramo è ancora fixable, ma il lavoro successivo dovrebbe essere raggruppato per blocchi di tabelle mancanti.