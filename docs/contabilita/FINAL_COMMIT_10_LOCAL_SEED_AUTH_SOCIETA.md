# FINAL-COMMIT-10 - Local seed controllato auth/società

## Stato iniziale da FINAL-COMMIT-09

La baseline di partenza è [FINAL_COMMIT_09_LOCAL_AUTH_BOOTSTRAP_ALIGNMENT.md](FINAL_COMMIT_09_LOCAL_AUTH_BOOTSTRAP_ALIGNMENT.md).

Punti rilevanti di 09:

- la UI era già local-only rispetto agli endpoint Supabase;
- `VITE_SUPABASE_URL` puntava al Supabase locale;
- i guard no-write passavano;
- la build passava;
- il bootstrap auth locale restava bloccato da seed locale mancante;
- il warning di società predefinita restava aperto come gap.

## Classificazione `.env.local`

Stato finale di `.env.local` dopo il seed controllato:

- `VITE_SUPABASE_URL=LOCAL`
- `VITE_SUPABASE_ANON_KEY=PRESENT`
- `VITE_DEV_LOCAL_AUTH_BYPASS=ON`
- `VITE_DEV_MOCK_SOCIETA_ID=PRESENT`
- `VITE_DEV_MOCK_UTENTE_ID=PRESENT`
- `VITE_DEV_MOCK_EMAIL=PRESENT`

Valori locali usati:

- `VITE_DEV_MOCK_SOCIETA_ID=3416f210-345e-4197-b391-cee4383682da`
- `VITE_DEV_MOCK_UTENTE_ID=7d0f1b56-74bb-4c55-b9a4-4e0d7c8c1a01`
- `VITE_DEV_MOCK_EMAIL=dev.local@fiscosim.local`

## Stato Supabase locale

Il setup locale Supabase è attivo.

- Studio: `http://127.0.0.1:54323`
- Project URL: `http://127.0.0.1:54321`
- REST: `http://127.0.0.1:54321/rest/v1`
- GraphQL: `http://127.0.0.1:54321/graphql/v1`
- Edge Functions: `http://127.0.0.1:54321/functions/v1`
- Database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Servizi stoppati ma non bloccanti: `supabase_imgproxy_fiscosim-local`, `supabase_pooler_fiscosim-local`

## Seed locale applicato

Seed minimo controllato applicato solo sul DB locale:

- `public.societa`
- `public.utenti_studio`
- `public.utenti_studio_societa`

Record creati/agganciati:

- societa: `FiscoSim Studio Locale`
- codice societa: `DEV`
- utente studio: `Dev Locale`
- email utente: `dev.local@fiscosim.local`
- mapping default: `owner`, `is_default = true`

Id locali principali:

- societa id: `3416f210-345e-4197-b391-cee4383682da`
- utente id: `7d0f1b56-74bb-4c55-b9a4-4e0d7c8c1a01`

## Policy locale aggiunta

Per rendere visibile il seed al bootstrap/UI locale è stata aggiunta una policy read-only locale su `public.societa`:

- `local_dev_allow_societa_select`
- `SELECT`
- condizione: `attiva = true`

Questa policy è stata applicata solo nel database locale.

## Stato record locali `societa`

Verifica locale:

- presente 1 riga attiva
- codice `DEV`
- denominazione `FiscoSim Studio Locale`
- `attiva = true`

## Stato record locali `utenti_studio`

Verifica locale:

- presente 1 riga
- nome `Dev`
- cognome `Locale`
- email `dev.local@fiscosim.local`
- ruolo `owner`
- attivo `true`
- `auth_user_id` coerente con l’id locale dell’utente

## Stato record locali `utenti_studio_societa`

Verifica locale:

- presente 1 riga
- `utente_id` coerente con l’utente dev
- `societa_id` coerente con la società dev
- ruolo `owner`
- `is_default = true`

## Cause del warning società predefinita

Il warning `Nessuna società attiva disponibile per il bypass locale` era dovuto al fatto che:

- il bootstrap auth locale su localhost provava a leggere la società via anon session locale;
- il DB locale non aveva record seedati;
- RLS locale bloccava la select su `societa`;
- il mock user non poteva essere costruito con una società valida.

Dopo seed + policy locale, il warning non è più il blocker principale.

## Interventi effettuati

- Aggiornato [\.env.local](../../.env.local) con `VITE_DEV_MOCK_UTENTE_ID` e `VITE_DEV_MOCK_EMAIL` locali.
- Creato [scripts/dev/seed-local-auth-bootstrap.sql](../../scripts/dev/seed-local-auth-bootstrap.sql).
- Creato [scripts/dev/local-dev-societa-select-policy.sql](../../scripts/dev/local-dev-societa-select-policy.sql).
- Aggiornato [src/App.jsx](../../src/App.jsx) per usare il `VITE_DEV_MOCK_SOCIETA_ID` locale già presente prima del fallback alla query.
- Applicato seed minimo nel DB locale.
- Applicata policy locale read-only per la select di `societa`.

## Conferma se la UI è local-only o no

La UI resta local-only rispetto agli endpoint Supabase.

- non sono emerse richieste verso il progetto remoto;
- il browser usa il runtime locale e il DB locale;
- l’ingresso UI è ora sbloccato dal seed locale.

## Conferma se il warning società predefinita è risolto o resta come gap

- il warning è risolto come blocker funzionale;
- il seed locale e la policy locale permettono ora il bootstrap della società predefinita.

## Esito build

- `npm run build`: PASS
- warning Vite sui chunk grandi: presente ma non bloccante.

## Esito guard/no-write

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`: PASS
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`: PASS
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`: PASS

## Verifica browser/UI

Verifiche effettuate in browser locale:

- dashboard caricata con utente `Dev Locale · Owner`;
- `Prima Nota` apre la società seedata `FiscoSim Studio Locale`;
- `Import Contabilità` apre con la società seedata selezionabile;
- `Riconciliazione avanzata` apre la vista demo bancaria;
- nessun contatto con endpoint remoto osservato;
- restano solo warning/errori locali di risorse non bloccanti (`404`, `400`, `405`) durante alcuni bootstrap/asset fetch.

## Conferma nessun DB remoto toccato

- confermato;
- il seed è stato eseguito solo sul DB locale;
- nessuna scrittura remota è stata effettuata.

## Conferma nessun SQL remoto/live

- confermato;
- nessun `db push`, `db reset`, `migration up` o SQL remoto è stato eseguito.

## Conferma nessun commit reale

- confermato;
- nessun commit reale è stato attivato;
- nessun `useRpc: true` è stato abilitato per commit reale;
- nessun `allowRealCommit: true` è stato attivato nei moduli core.

## Rischi residui

- la policy locale è più permissiva della baseline RLS di production, ma resta confinata al DB locale;
- i warning di risorse locali `404/400/405` restano non bloccanti;
- il seed è intenzionalmente minimale, quindi l’area dati resta da espandere solo se serve per demo più profonde;
- la build continua a mostrare il warning chunk-size di Vite.

## Prossimo step consigliato

Passare a una demo UI locale più profonda sui moduli core, sapendo che:

- il percorso auth/società è ora sbloccato;
- la UI è local-only;
- il seed minimo locale è in place;
- eventuali nuovi limiti saranno di dominio funzionale, non di bootstrap.

## Verdetto

**FINAL-COMMIT-10: A**

La UI locale è local-only, la società predefinita valida è presente, il dev bypass ha un utente e un mapping coerenti, e il bootstrap auth/società locale è finalmente sbloccato con seed controllato.