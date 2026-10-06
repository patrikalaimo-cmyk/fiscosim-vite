# FINAL-COMMIT-06A.20 - Audit dipendenza schema locale `public.regole_automatiche`

## Errore rilevato

Durante il bootstrap locale Supabase, lo start si ferma sulla migration [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) quando esegue:

- `drop policy if exists allow_all_regole on public.regole_automatiche`

Errore effettivo:

- `ERROR: relation "public.regole_automatiche" does not exist`

Il `NOTICE` precedente su `allow_all_percipienti` non è il blocker reale: la relazione che manca è `public.regole_automatiche`.

## Migration responsabile

La migration che fallisce è [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).

In questa migration `regole_automatiche` compare in più punti:

- `alter table if exists public.regole_automatiche add column if not exists societa_id uuid references public.societa(id);`
- `alter table if exists public.regole_automatiche enable row level security;`
- `drop policy if exists allow_all_regole on public.regole_automatiche;`
- `create policy societa_scoped_generic_policy_regole on public.regole_automatiche ...`

## Dove viene referenziata

Nel grafo migration `public.regole_automatiche` è referenziata in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) come tabella già esistente su cui applicare scoping, RLS e policy.

Non risultano altre migration Supabase che la creino prima di quel punto.

## Dove viene o non viene creata

### Nel grafo migration

- Non esiste una `CREATE TABLE IF NOT EXISTS public.regole_automatiche` nelle migration analizzate.
- Le migration successive a [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) la assumono come già presente quando fanno `alter table if exists` o policy-related operations, ma non la materializzano.

### Negli schema fuori migrations

- `schema_contabilita_completo.sql` contiene `CREATE TABLE IF NOT EXISTS regole_automatiche (...)` con `societa_id`, `nome`, `descrizione`, `condizioni`, `azioni`, `priorita`, `attiva`, `volte_applicata`, `ultima_applicazione`, `created_at`.
- `schema_contabilita.sql` non la definisce.
- `schema_v3.sql` non la definisce.

Quindi `regole_automatiche` esiste solo nello schema contabile completo, non nel grafo migration locale.

## Colonne minime

Le colonne minime coerenti con lo schema contabile completo e con le migration che la referenziano sono:

- `id`
- `societa_id`
- `nome`
- `descrizione`
- `condizioni`
- `azioni`
- `priorita`
- `attiva`
- `volte_applicata`
- `ultima_applicazione`
- `created_at`

Per lo start corrente, le colonne davvero bloccanti sono almeno:

- `id`
- `societa_id`
- `nome`
- `condizioni`
- `azioni`
- `attiva`
- `created_at`

`updated_at` non compare nello schema completo attuale, quindi non è richiesto per questa fase.

## Tipo di tabella

`public.regole_automatiche` è una tabella operativa reale del modello contabile completo, non una tabella legacy finta.

Tuttavia non è stata portata nel grafo migrations locale, quindi il bootstrap si rompe quando la migration RLS prova a toccarla.

## Diagnosi causa

La causa è una combinazione di:

- tabella mancante nel grafo migration;
- ordine migration errato rispetto alla prima migrazione che la usa;
- tabella presente solo nello schema contabile completo fuori migrations;
- policy scritta senza guardia `to_regclass`, quindi il `drop policy` cade su una relation assente.

Non sembra un problema di dati o di RLS runtime: è un problema di materializzazione incompleta del grafo.

## Fix possibili

1. Aggiungere una migration base minima per `public.regole_automatiche` prima di [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).
2. Oppure spostare la logica RLS/policy dopo la materializzazione della tabella.
3. Oppure introdurre una guardia `to_regclass` attorno al blocco di policy, se si volesse tollerare la tabella assente durante bootstrap. Questa però è una correzione più invasiva della base e non è il fix minimo preferibile.

## Fix consigliato

Il fix minimo consigliato è una migration base per `public.regole_automatiche` prima di [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), mantenendo la tabella indipendente e senza FK o seed iniziali.

## Rischi

- Dopo questo fix potrebbero emergere altri blocker sul ramo fiscale contabile, ma il punto di caduta su `regole_automatiche` verrebbe chiuso.
- Se si portasse la tabella dal solo schema completo al grafo, bisognerà verificare anche eventuali campi aggiuntivi usati da migration successive.
- Le policy già presenti in migration successive assumono che la tabella esista prima di essere mutate.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL è stato eseguito.
- Nessuna migration è stata applicata.

## Prossimo step

Se richiesto, il passo successivo sarebbe creare la migration base minima per `public.regole_automatiche` prima della chain RLS, senza modificare il runtime.

## Verdetto

**FINAL-COMMIT-06A.20: A**

La causa è chiara: `public.regole_automatiche` esiste nello schema contabile completo ma non nel grafo migration locale, e la migration RLS la tocca prima della sua materializzazione.