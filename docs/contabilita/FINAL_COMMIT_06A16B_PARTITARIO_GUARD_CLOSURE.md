# FINAL-COMMIT-06A.16B - Chiusura documentale e guard `public.partitario`

## Contesto

La migration base [20260412091000_partitario_base_bootstrap.sql](../../supabase/migrations/20260412091000_partitario_base_bootstrap.sql) materializza `public.partitario` singolare prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql), senza toccare il legacy plurale `public.partitari`.

## Verifiche statiche confermate

- `public.partitario` viene creato dalla nuova migration base.
- La migration è posizionata prima di `20260412093000_access_scope_columns.sql`.
- `public.partitari` legacy non è stato modificato.
- Non ci sono FK esterne verso `public.societa`, `public.documenti_contabilita`, `public.prima_nota` o `public.prima_nota_righe` nella migration base.
- Non ci sono seed.
- Non ci sono `insert`, `update` o `delete`.
- Non ci sono policy `allow_all`.
- Non ci sono alias, view o bridge fra `partitario` e `partitari`.

## Guard eseguito

Comando eseguito:

`node scripts/dev/test-canonical-rpc-migration-guard.mjs`

Esito:

`Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.`

## Diagnosi finale

Il blocco del bootstrap locale era dovuto alla mancanza della tabella singolare `public.partitario` nel grafo migrations. La base bootstrap minima risolve la dipendenza senza introdurre il ramo legacy `partitari` come sostituto improprio.

## Verdetto

**FINAL-COMMIT-06A.16B: A**

La chiusura è coerente: la migration base esiste, il guard passa e non sono emersi blocker aggiuntivi nella fase documentata.