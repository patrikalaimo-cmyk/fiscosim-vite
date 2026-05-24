# FINAL-COMMIT-06A6B - Chiusura documentale `public.clienti` per bootstrap locale

## Obiettivo di fase

Formalizzare la compatibilità legacy minima introdotta per sbloccare il bootstrap locale Supabase senza toccare il modello contabile nuovo.

Migration di riferimento:
- [supabase/migrations/20260403110000_legacy_clienti_compat.sql](../../supabase/migrations/20260403110000_legacy_clienti_compat.sql)

## Verifiche statiche confermate

1. La migration di compatibilità precede [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql).
2. La migration crea `public.clienti`.
3. La tabella espone almeno `id uuid primary key default gen_random_uuid()`.
4. Non introduce colonne legacy non necessarie per il bootstrap.
5. Non introduce seed.
6. Non introduce policy `allow_all`.
7. Non introduce `insert`, `update` o `delete`.
8. Non modifica il modello nuovo (`piano_conti`, `partitario`, `documenti_contabilita`, `prima_nota`).
9. La migration RLS successiva trova `public.clienti` e può applicare `enable row level security` e le policy dedicate.

## Evidenza sul grafo migration

- [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) usa `public.clienti(id)` come FK su `soggetto_id`.
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) abilita RLS e definisce policy su `public.clienti`.
- Il legacy schema in [schema.sql](../../schema.sql) contiene una definizione più ampia di `clienti`, ma per il bootstrap locale non serve riprodurla integralmente.

## Test guard eseguito

Comando eseguito:
- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`

Esito:
- `Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.`

Nota operativa:
- il guard esistente è passato, ma resta orientato alla migration RPC canonica; la compatibilità `public.clienti` è stata comunque verificata staticamente come parte della chiusura di fase.

## Verdetto finale

**FINAL-COMMIT-06A.6B: A**

La compatibilità legacy minima è presente, l’ordine delle migration è coerente e non sono emersi errori reali nel perimetro richiesto.
