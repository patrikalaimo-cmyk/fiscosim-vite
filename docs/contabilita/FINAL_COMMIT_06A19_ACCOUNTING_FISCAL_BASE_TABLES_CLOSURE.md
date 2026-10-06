# FINAL-COMMIT-06A.19 - Chiusura documentale e guard `causali_contabili` / `causali_iva` / `percipienti`

## Contesto

La migration base [20260412125000_accounting_fiscal_base_tables_bootstrap.sql](../../supabase/migrations/20260412125000_accounting_fiscal_base_tables_bootstrap.sql) materializza `public.causali_contabili`, `public.causali_iva` e `public.percipienti` prima di [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), senza toccare altre aree del grafo.

## Verifiche statiche confermate

- `public.causali_contabili` viene creato dalla nuova migration base.
- `public.causali_iva` viene creato dalla nuova migration base.
- `public.percipienti` viene creato dalla nuova migration base.
- La migration è posizionata prima di `20260412130000_rls_multi_tenant_isolation.sql`.
- Le colonne scope `tenant_id`, `company_id`, `created_by`, `owner_user_id`, `visibility`, `locked_by`, `locked_at` sono già aggiunte dalla migration RLS/scope successiva, quindi non sono duplicate qui.
- Non ci sono FK esterne verso `public.societa` o altre tabelle nella migration base.
- Non ci sono seed.
- Non ci sono `insert`, `update` o `delete`.
- Non ci sono policy `allow_all`.
- Non ci sono alias, view o bridge fra queste tabelle e altri rami legacy.

## Guard eseguito

Comando eseguito:

`node scripts/dev/test-canonical-rpc-migration-guard.mjs`

Esito:

`Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.`

## Diagnosi finale

Il blocco del bootstrap locale era dovuto alla mancanza delle tabelle base `public.causali_contabili`, `public.causali_iva` e `public.percipienti` nel grafo migrations. La base bootstrap minima consente alla migration di RLS/scope di aggiungere i campi successivi invece di saltare le tabelle.

## Verdetto

**FINAL-COMMIT-06A.19: A**

La chiusura è coerente: il cluster base esiste, il guard passa e non sono emersi blocker aggiuntivi nella fase documentata.