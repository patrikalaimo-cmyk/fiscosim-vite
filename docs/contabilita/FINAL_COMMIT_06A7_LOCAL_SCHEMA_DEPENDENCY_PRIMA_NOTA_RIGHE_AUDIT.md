# FINAL-COMMIT-06A7 - Audit dipendenza schema locale `public.prima_nota_righe`

## Errore rilevato

Lo stack locale Supabase si interrompe durante il bootstrap su una dipendenza legacy mancante:

- `relation "public.prima_nota_righe" does not exist`
- migration di caduta: [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql)

Contesto di fase:
- il blocker precedente su `public.clienti` è stato superato;
- il bootstrap ha applicato le migration precedenti e si è fermato sulla nuova dipendenza `public.prima_nota_righe`.

## File letti

- [supabase/migrations/20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql)
- [supabase/migrations/20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql)
- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [schema.sql](../../schema.sql)
- [schema_v3.sql](../../schema_v3.sql)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [supabase/config.toml](../../supabase/config.toml)
- [package.json](../../package.json)
- [docs/contabilita/FINAL_COMMIT_06A6B_LEGACY_CLIENTI_COMPAT_BOOTSTRAP.md](FINAL_COMMIT_06A6B_LEGACY_CLIENTI_COMPAT_BOOTSTRAP.md)

## Dove compare `public.prima_nota_righe`

### In migration Supabase

- [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql): FK `prima_nota_riga_id references public.prima_nota_righe (id)`.
- [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql): `alter table if exists public.prima_nota_righe ...`.
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql): `alter table if exists public.prima_nota_righe enable row level security`, policy e trigger dedicati.
- [20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql): menziona `public.prima_nota_righe` solo in commento / guard lato commit canonico.

### Fuori dalle migration

- [schema_contabilita.sql](../../schema_contabilita.sql): crea `prima_nota_righe` con `CREATE TABLE IF NOT EXISTS prima_nota_righe (...)`.
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql): crea `prima_nota_righe` con la stessa struttura legacy/contabile estesa.
- In [schema.sql](../../schema.sql) e [schema_v3.sql](../../schema_v3.sql) non risulta una creazione diretta di `prima_nota_righe`.

## Dove viene / non viene creata

### Viene creata nello schema contabile fuori migrations

- [schema_contabilita.sql](../../schema_contabilita.sql) contiene la definizione completa di `prima_nota` e `prima_nota_righe`.
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) conferma la stessa coppia di tabelle.

### Non viene creata nel grafo migration Supabase

- Non ho trovato una migration in [supabase/migrations/](../../supabase/migrations/) che faccia `create table prima_nota_righe` o `create table if not exists public.prima_nota_righe`.
- Le migration esistenti la trattano come prerequisito già disponibile, non come tabella creata nel bootstrap locale.

## Classificazione del problema

Il problema non sembra essere un semplice ordine sbagliato della sola [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql).

La diagnosi più probabile è:
- **migration mancante** nel grafo Supabase locale;
- **schema incompleto** rispetto allo schema contabile legacy/esteso;
- **refactor parziale**: il modello nuovo usa `prima_nota` / `prima_nota_righe`, ma la sua creazione non è stata portata nel bootstrap migration;
- **riferimento coerente ma non materializzato**: `ai_feedback_log` punta a una tabella attesa dal nuovo schema, però quella tabella non esiste quando il bootstrap la raggiunge.

## Risposte puntuali

1. `public.prima_nota_righe` viene creata da qualche migration? **No, non l'ho trovata nelle migration Supabase.**
2. `public.prima_nota_righe` esiste solo in schema legacy fuori migrations? **Sì, è presente in `schema_contabilita.sql` e `schema_contabilita_completo.sql`.**
3. `20260404200000_ai_feedback_log.sql` è più vecchia della migration che dovrebbe creare `prima_nota_righe`? **Non risulta una migration di creazione da confrontare; la tabella manca proprio nel grafo.**
4. La tabella corretta nel nuovo schema è davvero `prima_nota_righe`? **Sì, il nuovo schema contabile usa quel nome.**
5. `ai_feedback_log` sta puntando a un riferimento coerente o legacy? **Coerente con il modello contabile, ma non materializzato nel bootstrap locale.**
6. Il problema è: **migration mancante + refactor parziale + schema incompleto**.

## Fix possibili

1. Aggiungere nel grafo migration Supabase la creazione di `public.prima_nota_righe` prima di [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql).
2. Portare nel grafo anche la tabella `prima_nota` se manca il relativo prerequisito o se il bootstrap dipende dalla coppia completa.
3. Se il modello legacy non deve più esistere nel bootstrap, riscrivere [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql) per non dipendere da `prima_nota_righe`.
4. Se si vuole mantenere la compatibilità attuale, introdurre una migration di compatibilità minima per la sola struttura attesa dalla FK.

## Fix consigliato

Fix minimo per far proseguire lo stack locale senza rompere lo schema:

- aggiungere una migration che materializzi `public.prima_nota_righe` nel grafo Supabase locale prima delle migration che la referenziano;
- verificare in parallelo che anche `public.prima_nota` sia presente nel bootstrap, perché la RLS successiva e le FK mostrano che la coppia è trattata come prerequisito strutturale.

Motivo: la tabella è già prevista dallo schema contabile, quindi il problema è di porting incompleto nel grafo migration, non di un nome sbagliato.

## Rischi

- Se si aggiunge solo `prima_nota_righe` senza assicurare la presenza di `prima_nota`, potrebbero emergere altri errori di bootstrap a cascata.
- Una riscrittura isolata di `ai_feedback_log` sarebbe più rapida ma sposterebbe il debito architetturale invece di risolverlo.
- Portare tutta la definizione da `schema_contabilita.sql` nel grafo migration deve restare minimale per non introdurre superfici legacy non necessarie.

## Conferme operative

- Nessun DB remoto è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration è stata applicata manualmente.
- Nessun comando di start Supabase è stato rilanciato in questa fase di audit.

## Prossimo step

1. Se l'obiettivo è solo sbloccare il bootstrap locale, aggiungere la migration mancante per `public.prima_nota_righe` prima delle migration che la usano.
2. Se l'obiettivo è ripulire il legacy, pianificare una razionalizzazione più ampia di `prima_nota` / `prima_nota_righe` rispetto al nuovo modello contabile.

## Verdetto finale

**FINAL-COMMIT-06A.7: A**

La causa è chiara: `public.prima_nota_righe` appartiene al modello contabile atteso, ma non risulta materializzata nel grafo migration Supabase locale. Il fix minimo è portare quella tabella nel bootstrap prima delle migration che la referenziano.
