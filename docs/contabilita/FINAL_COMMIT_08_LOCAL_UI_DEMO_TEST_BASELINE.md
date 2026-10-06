# FINAL-COMMIT-08 - Demo/test applicativo locale controllato da UI

## Stato Supabase locale

Il setup locale Supabase risulta attivo.

- Studio: `http://127.0.0.1:54323`
- Project URL: `http://127.0.0.1:54321`
- REST: `http://127.0.0.1:54321/rest/v1`
- GraphQL: `http://127.0.0.1:54321/graphql/v1`
- Edge Functions: `http://127.0.0.1:54321/functions/v1`
- Database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Servizi stoppati ma non bloccanti: `supabase_imgproxy_fiscosim-local`, `supabase_pooler_fiscosim-local`

## URL app locale

- App: `http://localhost:5173/`

## Moduli aperti

- Consultazione Prima Nota
- Registrazione manuale
- Import Contabilità
- Riconciliazione bancaria

## Esito per modulo

### Consultazione Prima Nota

- Apertura riuscita dalla UI.
- Tabella registrazioni visibile.
- KPI e filtri visibili.
- Azioni di modifica/storno/commit non risultano attive nella consultazione.
- Stato: read-only confermato.

### Registrazione manuale

- Apertura riuscita dalla UI.
- Schermata di registrazione manuale visibile.
- Pannello anteprima presente con stato bozza / non registrato fiscalmente.
- Il flusso resta impostato come predisposizione operativa, non come commit reale.
- Stato: dry-run / no-write confermato.

### Import Contabilità

- Apertura riuscita dalla UI.
- Working view visibile.
- Selettore società, coda file, cronologia e staging presenti.
- Nessun pulsante di commit reale osservato in questa schermata.
- Stato: dry-run / no-write confermato.

### Riconciliazione bancaria

- Apertura riuscita dalla UI.
- Working table e pannello dettaglio visibili.
- Stato demo esplicitato in schermata con nota che non modifica lo staging reale.
- Azioni operative visibili, ma il contesto resta demo/gated.
- Stato: dry-run / no-write confermato.

## Errori console rilevati

Durante l’avvio e la navigazione sono stati osservati warning/errori non bloccanti:

- `Profilo utente incompleto: manca una societa predefinita valida.` durante il bootstrap auth locale iniziale.
- `Failed to load resource: the server responded with a status of 405 (Method Not Allowed)` in fase di bootstrap auth.
- `HEAD request ... failed: "net::ERR_ABORTED"` verso l’endpoint Supabase remoto configurato dall’app durante il bootstrap auth.
- `Failed to load resource: net::ERR_CONNECTION_REFUSED` verso il vecchio host `http://127.0.0.1:4173/` prima del riallineamento all’URL corretto.

Nessuno di questi errori ha bloccato l’apertura dei moduli core in UI.

## Schermate non raggiungibili

- Nessuna schermata core risulta non raggiungibile nella sessione verificata.
- La login iniziale e il bootstrap auth hanno generato warning, ma l’accesso alla shell applicativa è poi riuscito.

## Conferma no-write

- Nessuna scrittura reale è stata eseguita dai flussi UI verificati.
- La consultazione resta read-only.
- Registrazione manuale resta in bozza / dry-run.
- Import Contabilità resta in staging/dry-run.
- Riconciliazione bancaria resta in demo/gated.

## Conferma commit reale non attivo

- Nessun commit reale è stato attivato nei moduli UI verificati.
- Nessun `useRpc: true` è stato abilitato manualmente.
- Nessun `allowRealCommit: true` è stato abilitato manualmente.

## Conferma remoto non toccato

- Non sono stati eseguiti comandi di scrittura o mutazione sul DB remoto.
- L’unico traffico remoto osservato nel browser è stato un probing di bootstrap auth già previsto dall’app; non è stato usato per operazioni di scrittura.

## Warning residui

- Il bootstrap auth locale richiede una società predefinita valida; in questa sessione la shell applicativa ha comunque potuto aprirsi.
- Restano warning di rete e bootstrap non bloccanti.
- Il progetto continua a mostrare il warning Vite sui chunk grandi, ma la build rimane verde.

## Verdetto

**FINAL-COMMIT-08: B**

I quattro moduli core si aprono in UI locale e restano no-write / gated. Sono presenti warning di bootstrap e rete non bloccanti, ma non crash o blocchi funzionali nei moduli verificati.

## Prossimo step consigliato

Passare alla fase successiva solo dopo aver chiarito il bootstrap auth locale senza società predefinita, per ridurre i warning e stabilizzare l’ingresso UI.