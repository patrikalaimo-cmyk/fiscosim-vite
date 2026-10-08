# FISCOSIM — AUDIT RPC STAMPA DEFINITIVA (STATICO, NON PROD)

Data: 2026-10-08. Stato: **BLOCCANTE / NON FREEZE**.
Metodo: lettura delle migrations nel branch mio-branch, **non** introspezione del database reale.

## Origine e limite delle prove

- `supabase/migrations/20260621003000_fase_13d_b2_stampe_definitive_rpc.sql` definisce `precheck_stampa_definitiva` `SECURITY DEFINER`, esegue controlli contabili ma non espone nel precheck un attestato di byte/snapshot.
- `supabase/migrations/20260621233000_fix_audit_contabile_stampa_definitiva_constraints.sql` ridefinisce `consolidazione_stampa_definitiva` `SECURITY DEFINER`; richiede `p_checksum` soltanto non nullo/non vuoto e lo registra come se certificasse la stampa, con paginazione teorica 30/20 righe.
- Il codice SQL non dimostra un controllo `auth.uid()` del chiamante, membership tenant per `p_societa_id`, né verifica `p_creato_by` rispetto all'utente autenticato. `GRANT EXECUTE ... TO authenticated` non è sufficiente a dimostrare l'autorizzazione società. Essendo la funzione `public` e `SECURITY DEFINER`, eseguire auditing esplicito dei permessi effettivi, incluso il possibile EXECUTE ereditato da PUBLIC/anon. **Non affermare che la vulnerabilità sia attiva sul DB** senza introspezione.
- Nei due SQL il checksum non è validato rispetto ai byte archiviati, né il numero delle pagine rispetto al documento prodotto. Un advisory lock sul solo consolidamento non prova uno snapshot coerente durante il rendering del file esterno.
- Nel precheck il Libro Giornale verifica bilanciamenti di testata: ancora da provare che tutti gli stati contabili, ogni riga PN e gli effetti di storno siano considerati secondo policy fiscale canonica.
- `StampaDefinitivaPanel.jsx` blocca la UI in assenza di prove. Il `motoreStampaDefinitiva.js` ha ora ulteriore guard applicativo: esige SHA-256 64 caratteri, precheck positivo con evidenza e corrispondenza del digest. **La RPC SQL rimane il vero confine di sicurezza**; questi filtri applicativi sono difesa addizionale, non certificazione server.

## Esito della connessione Supabase

Plugin Supabase collegato. L'elenco progetti include "Fiscosim v4p", ID `mlydfspmrkaedsocubku`, stato **INACTIVE**, e `list_branches` ha restituito lista vuota. Le letture `list_tables` e `list_migrations` sul progetto sono fallite con timeout. Non è dimostrato che tale progetto corrisponda all'istanza FiscoSim operativa; **nessuna query ai dati, nessuna modifica, nessuna riattivazione**.
La verifica live di ruoli/RPC/RLS e dati deve avvenire prima su un branch di sviluppo o progetto di test, selezionato dall'utente.

## Audit DB da eseguire su branch isolato

1. Verificare che il branch abbia schema/migrations allineati al commit corrente e che non contenga dati di clienti reali.
2. Introspezione di `pg_proc` (definizione e `prosecdef`), `information_schema.routine_privileges`/`has_function_privilege` per anon, authenticated e PUBLIC; verificare autorizzazione effettiva del chiamante a `p_societa_id`.
3. Negare invocazioni intertenant con utenti autenticati reali di test e qualsiasi invocazione non autorizzata da anon; testare anche spoofing di `p_creato_by`.
4. Progettare il protocollo versionato: snapshot stabile di PN/IVA, emissione e archiviazione atomico-logica del PDF completo, SHA-256 calcolato lato server sul blob archiviato, rilettura e confronto, lock/consolidamento solo sul medesimo snapshot e identità operatore.
5. Numerazione pagine/campi documento derivata dal rendering effettivo, non da rapporto teorico righe/pagine; test PDF multi-pagina e ristampe.
6. Test ripetuti di concorrenza, duplicazioni, rollback, dati cambiati dopo il precheck, periodo già stampato, storni, tentativi di bypass e fail-closed senza file.
7. Solo dopo: migration versionata con autorizzazione esplicita, rollback e test E2E su database isolato. Non applicare migration a produzione automaticamente.

Riferimento sicurezza Supabase: https://supabase.com/docs/guides/api/securing-your-api

## Decisione

**Non abilitare la stampa definitiva**, non dare A100/freeze e non richiamare la RPC reale in assenza dei gate elencati. Proseguire con anteprime/esportazioni provvisorie, saldi e audit puri.

## Checkpoint 2026-10-08 — Fiscosim Supabase / gate RPC Stampe (CI certificata)

Codice: `a0b2480ab556492b77f4748428dc6686d838362f`. GitHub Actions `37781154980`: **SUCCESS Windows + Ubuntu**, build Vite PASS. Su entrambe le piattaforme: `test:stampe` **93/93**, `test:bank` **11/11**, `test:core` **661/661**, `test:all` **1036/1036**. Suite import 231/231, manuale 414/414, consultazione 38/38, IVA 148/148, split 25/25, ritenute 27/27.

Il consolidamento resta **NON FREEZE / NON PRONTO** nonostante la CI verde: il nuovo gate al service è solo difesa in profondità. Le funzioni SQL SECURITY DEFINER e il reale checksum server/snapshot non sono state verificate sul database. Supabase connesso; unico progetto nominativamente FiscoSim rilevato `Fiscosim v4p`, INACTIVE e senza branch; timeout su tabelle/migrazioni. Nessuna modifica DB, nessuna riattivazione o applicazione migration. L'utente deve scegliere/confermare un ambiente di test isolato e accessibile prima del collaudo SQL/E2E.
