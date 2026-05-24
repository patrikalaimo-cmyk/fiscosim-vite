# FINAL-COMMIT-06A.18 - Chiusura documentale e guard `documenti_import` / `revisioni_dichiarativi`

## Contesto

La migration base [20260412090500_access_scope_base_tables_bootstrap.sql](../../supabase/migrations/20260412090500_access_scope_base_tables_bootstrap.sql) materializza `public.documenti_import` e `public.revisioni_dichiarativi` prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql), senza toccare altre aree del grafo.

## Verifiche statiche confermate

- `public.documenti_import` viene creato dalla nuova migration base.
- `public.revisioni_dichiarativi` viene creato dalla nuova migration base.
- `public.documenti_import` include `societa_destinazione_id`, colonna richiesta da [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql).
- La migration è posizionata prima di `20260412093000_access_scope_columns.sql`.
- `public.documenti_import` e `public.revisioni_dichiarativi` non sono stati modificati altrove in modo da sostituire questa base.
- `societa_destinazione_id` non ha FK verso `public.societa` e serve solo al bootstrap / access-scope.
- Non ci sono FK esterne verso `public.societa`, `public.documenti_contabilita`, `public.prima_nota` o `public.prima_nota_righe` nella migration base.
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

Il blocco del bootstrap locale era dovuto alla mancanza delle tabelle base `public.documenti_import` e `public.revisioni_dichiarativi` nel grafo migrations. La base bootstrap minima consente alla migration di access-scope di aggiungere i campi scope invece di saltare le tabelle con `alter table if exists`.

## Verdetto

**FINAL-COMMIT-06A.18: A**

La chiusura è coerente: il cluster base esiste, il guard passa e non sono emersi blocker aggiuntivi nella fase documentata.