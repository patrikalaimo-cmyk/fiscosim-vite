# FINAL-COMMIT-11 - Demo UI locale profonda sui 4 moduli core

## Stato di partenza

Baseline confermata da [FINAL_COMMIT_10_LOCAL_SEED_AUTH_SOCIETA.md](FINAL_COMMIT_10_LOCAL_SEED_AUTH_SOCIETA.md):

- Supabase locale attivo.
- `.env.local` local-only.
- Seed auth/società completato nel DB locale.
- Società DEV presente e attiva.
- Utente Dev Locale presente.
- Relazione utente/società default presente.
- UI già capace di vedere la società seedata.
- Guard no-write già verdi.
- Build già verde.
- Commit reale non attivato.

## Verifiche preliminari

- `npx supabase status`: PASS.
- `.env.local`: confermato local-only senza stampare chiavi.
- UI raggiungibile su `http://localhost:5173/`: PASS.
- Società visibile nella UI: PASS.
- Nessuna richiesta remota osservata durante la sessione: PASS.

## Modulo 1 - Consultazione Prima Nota

Esito: **PASS con warning**.

Verifiche confermate:

- apertura modulo: PASS;
- società DEV visibile: PASS;
- KPI/header visibili: PASS;
- filtri visibili: PASS;
- tabella visibile: PASS;
- stato empty coerente se non ci sono registrazioni: PASS;
- nessun crash: PASS;
- nessuna azione di commit/scrittura attiva: PASS;
- pulsanti di modifica/storno presenti ma protetti dal flusso read-only: PASS;
- console senza errori bloccanti: PASS con warning, presenti 404/400 locali non bloccanti.

Nota operativa:

- la vista mostra il comportamento read-only atteso;
- le azioni di modifica/storno non sono state eseguite.

## Modulo 2 - Registrazione Manuale

Esito: **PASS con warning**.

Verifiche confermate:

- apertura modulo: PASS;
- società DEV visibile: PASS;
- form prima nota visibile: PASS;
- righe Dare/Avere visibili: PASS;
- anteprima bozza visibile: PASS;
- compilazione minima: non eseguita, per mantenere il test solo in bozza/dry-run;
- pulsante salva/registrazione reale non eseguito: PASS;
- messaggi di bozza/dry-run/gated presenti: PASS;
- nessuna scrittura finale: PASS;
- console senza errori bloccanti: PASS con warning, presenti 404/400 locali non bloccanti.

Nota operativa:

- la schermata mostra chiaramente che la registrazione è predisposta ma non fiscalmente registrata;
- nessun commit reale è stato attivato.

## Modulo 3 - Import Contabilità

Esito: **PASS con warning**.

Verifiche confermate:

- apertura modulo: PASS;
- società DEV visibile: PASS;
- area import visibile: PASS;
- working table/staging visibile: PASS;
- pannelli report/anagrafiche/working view raggiungibili: PASS;
- dry-run panel o stato gated presente: PASS;
- nessun commit reale: PASS;
- nessun import definitivo richiesto: PASS;
- nessuna chiamata remota osservata: PASS;
- console senza errori bloccanti: PASS con warning, presenti 400 locali non bloccanti.

Nota operativa:

- la schermata è rimasta in stato staging vuoto e controllato;
- non sono stati importati dati reali.

## Modulo 4 - Riconciliazione Bancaria

Esito: **PASS con warning**.

Verifiche confermate:

- apertura modulo: PASS;
- società DEV visibile: PASS;
- area import/working table visibile: PASS;
- stato demo/no-write visibile: PASS;
- dettaglio movimento o tabella visibile: PASS;
- azioni conferma/applica protette o in dry-run: PASS;
- nessuna scrittura reale su partitario/prima nota: PASS;
- nessuna chiamata remota osservata: PASS;
- console senza errori bloccanti: PASS con warning, presenti 404/400 locali non bloccanti.

Nota operativa:

- la vista banca mostra una demo completa con proposte, working table e dettagli movimento;
- le azioni di conferma non sono state eseguite.

## Verifiche finali richieste

- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`: PASS.
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`: PASS.
- `npm run build`: PASS.

Nota build:

- resta il warning Vite sui chunk grandi, ma non è bloccante.

## Esito complessivo

La demo UI locale profonda sui 4 moduli core è stata verificata con successo in modalità controllata:

- consultazione prima nota: ok;
- registrazione manuale: ok;
- import contabilità: ok;
- riconciliazione bancaria: ok.

Il perimetro resta:

- local-only;
- senza commit reale;
- senza scritture finali contabili;
- senza contatto remoto osservato.

## Verdetto

**FINAL-COMMIT-11: A-**

Motivo: tutti e quattro i moduli core sono stati aperti e verificati in UI locale con società DEV visibile e flussi no-write/dry-run coerenti; restano solo warning locali non bloccanti in console e il warning di chunk-size della build.