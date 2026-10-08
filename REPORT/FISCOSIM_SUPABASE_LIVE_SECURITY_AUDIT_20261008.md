# AUDIT LIVE SUPABASE — FISCOSIM v4p — 2026-10-08

**Ambito:** introspezione READ-ONLY del catalogo PostgreSQL della istanza Fiscosim v4p ripristinata; nessuna query a righe di clienti, modifica DB, deploy o migrazione. **STATO: CRITICAL / BLOCKER PRODUZIONE.**

## Identificazione e ripristino

- Ref progetto Supabase `mlydfspmrkaedsocubku`; stesso endpoint presente in `.env.example` sul branch `mio-branch`. La configurazione di ambiente effettivamente distribuita non è stata ancora verificata.
- Durante il ripristino `COMING_UP` e `RESTORING` si sono osservate temporaneamente zero tabelle. **Esito corretto dopo ripristino:** `ACTIVE_HEALTHY`, 73 tabelle in `public`, 27 funzioni e 141 policy. Il dato iniziale zero tabelle era transitorio e non implica cancellazione.
- Esistono `prima_nota`, `prima_nota_righe`, `piano_conti`, `stampe_definitive`, `utenti_studio`, `societa` e `audit_contabile`. Non sono state lette righe applicative.
- `list_migrations` ha restituito `[]`; la relazione `supabase_migrations.schema_migrations` non è stata trovata. Nel repo esistono 72 file in `supabase/migrations`. **Schema presente ≠ cronologia di migrazione certificata**: non applicare indiscriminatamente migrazioni versionate, non presumere che un branch automatico ricostruisca questo database.

## Vulnerabilità verificabili nel catalogo (P0)

1. `consolidazione_stampa_definitiva` e `precheck_stampa_definitiva` in `public` sono `SECURITY DEFINER`, owner `postgres` e permesso `EXECUTE` effettivo per `anon`, `authenticated` e PUBLIC. Entrambe prive di riferimenti `auth.uid()`, `auth.jwt()`, controllo `user_has_societa_access` o `utenti_studio` nel testo della funzione. Il consolidamento accetta un checksum client senza verificarne i byte del file, e modifica registrazioni/stampe.
2. **Otto funzioni `SECURITY DEFINER` complessive** risultano eseguibili da `anon`, tra cui `apply_ai_learning_from_feedback`, `consolida_periodo_iva_transazionale`, `rpc_annulla_prima_nota_logica`, `rpc_get_prima_nota_operation_guards`, `rpc_storna_prima_nota_generale`, `rpc_update_prima_nota_generale_controllata`. Quattro delle ultime RPC mostrano testuali controlli `auth.uid` e di società; ciò NON elimina la necessità di revocare accessi superflui e collaudarle. `apply_ai_learning_from_feedback` non mostra tali controlli.
3. **22 tabelle `public`** hanno almeno una policy `USING true` o `WITH CHECK true` applicabile a PUBLIC/anon e concedono contemporaneamente a `anon` `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Esempi: `prima_nota_righe` policy `allow_all_pn_righe`; `utenti_studio` policy `public_access`; `coda_import_fatture`, `documenti_import`, `causali_contabili`, `causali_iva`, `fatture_xml`, `f24_righe`, `f24_scadenze`, `documenti_contabilita`, `impostazioni_studio`, `avvisi_ade` (policy esplicitamente chiamata `anon_access_test`). Alcune delle 22 tabelle sono organizzative o test, ma molte contengono dati fiscali potenzialmente sensibili.
4. `prima_nota`, `societa`, `piano_conti`, `stampe_definitive` risultano con RLS attiva ma con privilegi DML concessi ad `anon`. Le policy correnti sono da validare per effettiva autorizzazione e composizione OR con policy permissive. **RLS enabled non basta**.
5. L'advisor Supabase `security` ha restituito lista vuota, ma le evidenze di catalogo precedenti sono specifiche e più forti; un advisor verde non certifica la sicurezza.

**Gravità:** P0 in quanto i permessi effettivi e le policy permissive espongono operazioni anonime anche su tabelle contabili. Non è stato effettuato un tentativo HTTP con chiave anon né lettura dati: non sono attestati incidenti o exploit avvenuti.

## Bonifica proposta — SOLO dopo consenso esplicito e controllo impatti

### Fase 0 — preservazione

- Verificare che l'istanza sia realmente quella usata dagli utenti; backup/snapshot prima di modifiche e stato della Data API, ruoli applicativi in uso, route attive.
- Sospendere rollout A100 e stampa definitiva. Non creare utenti o dati di clienti a scopo test nel database live.
- Ricostruire una baseline **schema-only** versionata dalla istanza reale e confrontarla con i 72 file del repo, evitando applicazione sequenziale cieca di migrazioni senza tracking.

### Fase 1 — contenimento di accessi anonimi

- Progettare in transazione SQL la revoca di `EXECUTE` su RPC privilegiate inappropriate a `PUBLIC` e `anon` (e valutare la necessità di sospendere temporaneamente `authenticated` per RPC senza controllo tenant), con verifica di `has_function_privilege` prima/dopo. Non affidarsi al solo `REVOKE ... FROM anon`: il grant a `PUBLIC` può continuare ad attribuire il privilegio.
- Per le 22 tabelle: rimuovere la combinazione anon DML + policy `true`, conservando l'accesso autenticato **solo** con predicate di appartenenza tenant e permessi minimi per funzione. Attenzione: policy RLS `PERMISSIVE` sono combinate in OR; l'aggiunta di una policy corretta non neutralizza la vecchia policy `true`.
- Verificare in particolare `utenti_studio` e `prima_nota_righe` e i documenti fiscali; valutare protezione dei record preesistenti in `storage` se esposti.

### Fase 2 — riparazione RPC e stampa certificata

- Proteggere a livello server la membership utente/società e identità operatore; definire ruoli autorizzati e controlli `auth.uid()` effettivi, con replay/idempotenza/rollback.
- RPC di stampa: prima esistenza e immutabilità del PDF, hash byte verificato server-side, snapshot legato alla registrazione, progressivi reali, blocco di periodo e audit in unica sequenza atomica controllata.
- Diff schema/migration, ambiente isolato con soli dati sintetici, test accessi `anon`, `authenticated` membro/non membro, revoche/rollback, concorrenza, storni e stampe ristampate.
- Gli attuali gate UI e service **non** sostituiscono questo lavoro DB.

## Vincoli operativi

- Questo report **non autorizza né applica** SQL correttivo, DDL, GRANT/REVOKE, RLS, backup distruttivi, reset, branch con costi o deploy.
- Richiedere approvazione dell'utente prima di intervenire sull'istanza esistente. Preferire branch/progetto isolato con baseline fedele e fatture/PN sintetiche; la disponibilità e il prezzo vanno verificati.
- Esito: blocco sicurezza P0 **APERTO**, STAMPE definitive **NON FREEZE**, BANK commit reale **NON AUTORIZZATO**.

Riferimento Supabase: https://supabase.com/docs/guides/api/securing-your-api
