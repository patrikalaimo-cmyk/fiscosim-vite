# FINAL-COMMIT-06A5 - Audit dipendenza schema locale `public.clienti`

## Errore rilevato

Lo старт locale di Supabase si interrompe durante l'applicazione delle migration perché la migration [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) crea `public.partitari` con una FK verso `public.clienti`, ma la relation `public.clienti` non esiste nel set di migration locale.

Errore osservato:

- `relation "public.clienti" does not exist (SQLSTATE 42P01)`
- punto di caduta: [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql)

## File letti

- [supabase/migrations/20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql)
- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [schema.sql](../../schema.sql)
- [schema_v3.sql](../../schema_v3.sql)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [package.json](../../package.json)
- [supabase/config.toml](../../supabase/config.toml)

## Dove compare `public.clienti`

In migration:

- [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql): FK di `public.partitari.soggetto_id` verso `public.clienti(id)`.
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql): `alter table if exists public.clienti enable row level security;` e policy su `public.clienti`.

Nel legacy schema fuori dalle migrations:

- [schema.sql](../../schema.sql): crea `clienti` con `create table if not exists clienti (...)`.
- [schema_v3.sql](../../schema_v3.sql): usa ancora `clienti` come tabella legacy tramite varie FK e `alter table clienti ...`.

## Dove viene / non viene creata

### Viene creata solo nel legacy fuori migrations

- [schema.sql](../../schema.sql) crea `clienti`.

### Non viene creata nelle migrations Supabase

- Nessuna migration in [supabase/migrations/](../../supabase/migrations/) contiene `create table public.clienti` o `create table clienti`.
- Le migrations che la citano la trattano come prerequisito già esistente, non come oggetto creato lì.

## Classificazione del problema

Il problema è un mix di:

- **migration mancante** nel set Supabase locale;
- **riferimento legacy** rimasto nella migration `partitari`;
- **refactor parziale** tra schema legacy e schema contabile nuovo.

Non sembra un errore di ordine: `public.clienti` non risulta proprio definita nel grafo di migration locale, quindi metterla più tardi non risolverebbe il bootstrap iniziale.

## Diagnosi causa

Il dump legacy [schema.sql](../../schema.sql) definisce una tabella `clienti`, ma il bootstrap locale di Supabase applica solo le migration in [supabase/migrations/](../../supabase/migrations/).

Nel ramo contabile nuovo, le tabelle operative usano invece `societa_id`, `piano_conti`, `causali_contabili`, `causali_iva` e `partitario` come modello multi-tenant, come si vede in [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql).

Quindi il file [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) è un residuo legacy che presuppone `public.clienti`, ma quella tabella non è stata portata nel set migration locale.

## Fix possibili

1. Aggiungere una migration di compatibilità che crei `public.clienti` prima di [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql).
2. Riscrivere [20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) per usare il modello nuovo, se la tabella legacy non deve più esistere.
3. Portare nel grafo migration tutte le parti legacy che ancora dipendono da `clienti`, se si vuole mantenere il vecchio modello.

## Fix consigliato

Fix minimo per sbloccare lo stack locale:

- introdurre una migration Supabase che definisca `public.clienti` con la stessa struttura minima attesa dalle migration legacy, prima di qualsiasi FK/policy che la referenzi.

Motivo: è la modifica meno invasiva per rendere il bootstrap locale coerente con la chain esistente, senza toccare subito il resto del dominio contabile.

## Rischi

- La presenza di `clienti` come tabella legacy può mantenere due rappresentazioni concettuali del soggetto: `clienti` da un lato, `piano_conti`/anagrafiche contabili dall'altro.
- Se il modello nuovo è quello desiderato, il fix di compatibilità sblocca lo start ma non risolve il debito architetturale.
- Una riscrittura diretta della migration `partitari` sarebbe più pulita, ma è un intervento più ampio e rischia regressioni in altre migration che ancora si aspettano `public.clienti`.

## Prossimo step

1. Se l'obiettivo è solo far partire lo stack locale, aggiungere la migration di compatibilità per `public.clienti`.
2. Se l'obiettivo è eliminare il legacy, pianificare la migrazione strutturale verso il modello `piano_conti`/`partitario` e rimuovere la dipendenza da `clienti`.

## Verdetto finale

**FINAL-COMMIT-06A.5: A**

La causa è chiara: `public.clienti` è un prerequisito legacy non portato nelle migrations Supabase. Il fix minimo per sbloccare lo start locale è aggiungere una migration di compatibilità che la crei prima delle migration che la referenziano.