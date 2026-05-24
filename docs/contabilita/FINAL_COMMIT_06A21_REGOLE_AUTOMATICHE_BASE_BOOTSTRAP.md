# FINAL-COMMIT-06A.21 - Bootstrap base `public.regole_automatiche`

## Obiettivo

Materializzare la tabella base `public.regole_automatiche` prima della migration RLS che la usa, senza toccare DB, runtime o policy esistenti oltre il minimo necessario al grafo locale.

## File creato

- [supabase/migrations/20260412125500_regole_automatiche_base_bootstrap.sql](../../supabase/migrations/20260412125500_regole_automatiche_base_bootstrap.sql)

## Contenuto del bootstrap

La migration crea `public.regole_automatiche` con il set minimo di colonne coerente con lo schema contabile completo:

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

Non include policy, trigger, seed o FK aggiuntive.

## Riferimento al blocker

Il blocker iniziale era in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), sul `drop policy if exists allow_all_regole on public.regole_automatiche`.

Con questa migration, la relazione esiste prima della chain RLS che la tocca.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration esistente è stata modificata.

## Prossimo step

Rieseguire il bootstrap locale controllato per verificare se il blocco su `public.regole_automatiche` è risolto e quale sia il prossimo blocker residuo.

## Verdetto

**FINAL-COMMIT-06A.21: A**

La causa era una tabella presente nello schema contabile completo ma assente nel grafo migrations; il fix minimo è la base bootstrap ante-RLS.