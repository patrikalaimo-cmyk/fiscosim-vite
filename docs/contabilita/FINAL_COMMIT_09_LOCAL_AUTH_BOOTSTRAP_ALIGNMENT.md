# FINAL-COMMIT-09 - Riallineamento auth/bootstrap locale realmente local-only

## Stato iniziale da FINAL-COMMIT-08

La baseline di partenza è [FINAL_COMMIT_08_LOCAL_UI_DEMO_TEST_BASELINE.md](FINAL_COMMIT_08_LOCAL_UI_DEMO_TEST_BASELINE.md).

Punti rilevanti di 08:

- i 4 moduli core si aprivano in UI locale;
- Consultazione restava read-only;
- Registrazione manuale restava bozza/dry-run;
- Import Contabilità restava staging/no-write;
- Riconciliazione restava demo/no-write;
- nessun commit reale era attivo;
- però il bootstrap/auth locale emetteva richieste residue verso endpoint remoto;
- compariva il warning `Profilo utente incompleto: manca una societa predefinita valida`.

## Classificazione env locale/remoto

Stato finale di `.env.local` dopo l'allineamento:

- `VITE_SUPABASE_URL=LOCAL`
- `VITE_SUPABASE_ANON_KEY=PRESENT`
- `VITE_DEV_LOCAL_AUTH_BYPASS=ON`
- `VITE_DEV_MOCK_SOCIETA_ID=PRESENT`
- `VITE_DEV_MOCK_UTENTE_ID=ABSENT`

Intervento effettuato:

- `VITE_SUPABASE_URL` è stato riallineato da remoto a `http://127.0.0.1:54321`.
- `VITE_SUPABASE_ANON_KEY` è stato riallineato alla chiave pubblicabile locale mostrata da `npx supabase status`.
- `SUPABASE_URL` è stato riallineato al Supabase locale.
- `SUPABASE_SERVICE_ROLE_KEY` è stato riallineato al secret locale del progetto.

## Stato dev local auth bypass

- Il bypass dev locale risulta abilitato in `.env.local`.
- Tuttavia, su `localhost`, il bootstrap auth segue ancora il ramo `isLocalAuthDisabled()` e prova a risolvere una società attiva via `public.societa` locale.
- Non è stato toccato il codice dell'app in questa fase.

## Stato società locale

Query read-only sul PostgREST locale per `public.societa`:

- esito: `404 Not Found`

Conclusione:

- nel database locale non risulta esposta una tabella interrogabile via PostgREST per `public.societa`, oppure il grafo locale non è stato seedato abbastanza da renderla disponibile all'API;
- in ogni caso non esiste una società attiva locale utilizzabile per il bootstrap UI.

## Stato utenti_studio locale

Query read-only sul PostgREST locale per `public.utenti_studio`:

- esito: `404 Not Found`

Conclusione:

- non c'è un set locale di utenti studio interrogabile via API locale per supportare il bootstrap auth.

## Stato utenti_studio_societa locale

Query read-only sul PostgREST locale per `public.utenti_studio_societa`:

- esito: `404 Not Found`

Conclusione:

- manca il mapping locale tra utente e società richiesto per il profilo operativo.

## Cause del warning società predefinita

Il warning `Profilo utente incompleto: manca una societa predefinita valida` nasce perché:

- il ramo di bootstrap auth locale su localhost prova a leggere le società attive dal DB locale;
- la query non trova una società attiva utilizzabile;
- la funzione `fetchSessionProfile()` richiede un profilo con `societa_assegnate` e `societa_default_id` coerenti;
- `src/App.jsx` costruisce il mock user solo dopo aver trovato una società attiva locale.

Quindi la causa non è più il remote endpoint: il problema residuo è un seed gap locale.

## Interventi effettuati

- Aggiornato [\.env.local](../../.env.local) per puntare al Supabase locale.
- Nessuna modifica al codice runtime dei moduli core.
- Nessuna scrittura su DB remoto.
- Nessun commit reale attivato.

## Conferma se la UI è local-only o no

La UI è ora local-only dal punto di vista delle destinazioni Supabase:

- non sono più emerse richieste verso l'endpoint remoto del progetto Supabase;
- il browser ha mostrato solo il fallimento locale del bootstrap auth;
- l'errore corrente è interno al percorso locale.

Quindi: **local-only sì**, ma con bootstrap incompleto.

## Conferma se il warning società predefinita è risolto o resta come gap

- il warning non è risolto;
- è stato riclassificato come **gap di seed locale**;
- senza record locali di supporto, il bootstrap auth non può costruire una società predefinita valida.

## Esito build

- `npm run build`: PASS
- warning Vite sui chunk grandi: presente ma non bloccante.

## Esito guard/no-write

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`: PASS
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`: PASS
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`: PASS

## Conferma nessun DB remoto toccato

- confermato;
- nessun comando di scrittura o mutazione è stato eseguito sul DB remoto;
- le interazioni avvenute sono state di lettura e di browser bootstrap locale.

## Conferma nessun SQL remoto/live

- confermato;
- non sono stati eseguiti `db push`, `db reset`, `migration up` o SQL live remoto.

## Conferma nessun commit reale

- confermato;
- nessun commit reale è stato attivato nei moduli UI;
- nessun `useRpc: true` è stato introdotto;
- nessun `allowRealCommit: true` è stato attivato per un flusso reale.

## Rischi residui

- il bootstrap auth locale resta incompleto finché non esiste una società attiva locale interrogabile;
- le tabelle di supporto `societa`, `utenti_studio` e `utenti_studio_societa` non risultano disponibili via PostgREST locale;
- i moduli core non sono demo-visitabili in profondità finché manca un seed locale controllato;
- la build continua a produrre warning chunk-size non bloccanti.

## Prossimo step consigliato

Aprire una fase separata di **local seed controllato** per:

- materializzare una società attiva locale;
- creare un utente studio locale coerente;
- creare il mapping `utenti_studio_societa` con default valido;
- poi rieseguire la demo UI locale per verificare l'ingresso senza warning auth.

## Verdetto

**FINAL-COMMIT-09: B**

La UI è diventata local-only rispetto agli endpoint Supabase, ma il bootstrap/auth locale resta bloccato dalla mancanza di un seed locale valido per la società predefinita.