# REGOLE CODEX — FiscoSim

Questo file definisce le regole operative ferree per lavorare su FiscoSim.

## 1. Regole assolute

1. AI propone, operatore conferma: nessuna azione contabile o fiscale deve essere eseguita automaticamente senza conferma esplicita dell'operatore.
2. Non modificare funzioni funzionanti per rifarle da zero: si preferisce integrare, estendere o sostituire in modo controllato.
3. Un file alla volta, un problema alla volta: evitare patch trasversali e refactor larghi non richiesti.
4. Un solo esecutore tecnico sul repo per volta: niente patch parallele da più agenti sullo stesso perimetro.
5. Nessuna scelta arbitraria su conti, causali, soggetti o logiche fiscali: ogni scelta deve derivare da configurazione, anagrafica o regola esplicita.
6. Nessuna scrittura reale se il flusso è ancora in stato dry-run, mock, audit-only o temporaneamente bloccato.
7. Nessuna modifica a env, auth, DB o migration senza richiesta esplicita e perimetro approvato.
8. Nessun git add, commit, push, reset hard o revert distruttivo senza richiesta esplicita.
9. Nessun report sparso: da ora i report operativi si aggiornano solo in `REPORT/REPORT_CODEX.md`.

## 2. Metodo di lavoro

1. Prima di ogni intervento: audit mirato del flusso, dei file attivi e dei rischi.
2. Poi: patch minima necessaria, senza allargare il perimetro.
3. Poi: build e test coerenti con il task.
4. Poi: aggiornamento obbligatorio di `REPORT/REPORT_CODEX.md`.
5. Ogni task deve dichiarare:
   - obiettivo
   - file letti
   - file modificati
   - test eseguiti o non eseguiti
   - rischi residui
   - prossimo step consigliato
6. Se un problema coinvolge più moduli, prima si chiarisce il perimetro attivo e solo dopo si modifica il codice.
7. Se un comportamento è ambiguo, prevale la correttezza contabile e fiscale sulla comodità UI.

## 3. Architettura FiscoSim

1. FiscoSim è un gestionale fiscale-contabile italiano interno di studio.
2. Non è previsto invio telematico diretto; il prodotto deve arrivare a predisposizione, controllo, export e audit.
3. I moduli non devono dialogare direttamente in modo arbitrario: il coordinamento passa dal core e dai workflow definiti.
4. Il target architetturale è un asse unico e coerente per:
   - documento contabile
   - prima nota
   - registri IVA
   - partitario
   - fiscal outputs
5. I path legacy si possono leggere se indispensabili, ma non devono guidare lo sviluppo futuro.
6. La nuova contabilità è la direzione corretta; il legacy serve solo come riferimento o fonte di recupero controllato.

## 4. Moduli attivi e moduli legacy vietati

### Moduli attivi

- `src/modules/contabilita`
- `src/modules/import_contabilita`
- `src/modules/partitario`
- `src/modules/piano_conti`
- `src/modules/ammortamenti`
- `src/modules/f24`
- `src/modules/cu`
- `src/modules/clienti`

### Moduli attivi ma in transizione

- `src/modules/iva`
- `src/modules/fatture_ade`
- `src/modules/export_dati`
- `src/modules/dashboard`
- `src/modules/agecon`
- `src/modules/adempimenti`
- `src/modules/agenda`

### Moduli legacy vietati per nuovo sviluppo

- `src/modules/import_fatture`
- `src/modules/import_unificato`
- `DISUSO`
- `src/modules/contabilita/prima_nota_guidata.jsx`

### Regola operativa

1. I moduli legacy si possono leggere solo se indispensabili per audit o recupero logica.
2. Non si aggiungono nuove feature nei moduli legacy.
3. Le nuove patch devono puntare ai moduli attivi.

## 5. Regole su backup, commit e rollback

1. Prima di interventi importanti si crea un backup zip della cartella di progetto.
2. I backup devono avere nome con data chiara, preferibilmente `nomeprogetto-backup-GG.MM.AAAA.zip`.
3. Ogni due giorni è consigliato un backup automatico del progetto.
4. I commit, quando autorizzati, devono essere piccoli, leggibili e focalizzati su un solo problema.
5. Niente commit “miscellanei” con più aree non correlate.
6. Niente rollback distruttivi senza conferma esplicita.
7. In caso di recovery si lavora su copie isolate o worktree separate, mai sulla cartella primaria senza protezione.

## 6. Regole sui report

1. Esiste un solo report operativo ufficiale: `REPORT/REPORT_CODEX.md`.
2. Ogni task deve aggiornare quel file.
3. Non si creano nuovi report sparsi in root, in `docs`, in `qa` o in altre cartelle salvo richiesta esplicita.
4. Il report deve restare sintetico, operativo e cronologico.
5. Ogni aggiornamento deve indicare chiaramente:
   - data
   - task
   - file creati
   - file modificati
   - test eseguiti o non eseguiti
   - rischi
   - prossimo step

## 7. Regole su test e build

1. Ogni patch deve tentare almeno una verifica coerente con il task.
2. Se il task tocca documentazione o processi e non il codice, i test possono essere non eseguiti, ma va dichiarato.
3. Se il task tocca il codice applicativo, va eseguito almeno:
   - `npm run build`, se plausibile per il perimetro
   - oppure test locali specifici del modulo
4. Le verifiche UI vanno fatte solo sul flusso attivo, non su schermate legacy.
5. Se i test non sono eseguibili, va scritto esplicitamente il motivo.

## 8. Regole su modifiche DB/auth/env/migration

1. Non modificare `.env`.
2. Non modificare `.env.local`.
3. Non modificare auth o access scope senza task esplicito.
4. Non cambiare Supabase URL o chiavi senza richiesta esplicita.
5. Non toccare DB remoto.
6. Non fare migration, db push o db reset salvo task esplicito e confermato.
7. Non usare workaround insicuri per aggirare auth o RLS in produzione.
8. Ogni eccezione a queste regole va dichiarata prima del lavoro, non dopo.

## 9. Regole su contabilità italiana e validazione funzionale

1. La correttezza contabile e fiscale prevale sulla comodità UI.
2. Le scritture devono derivare da:
   - causali configurate
   - anagrafica
   - piano dei conti
   - regole fiscali esplicite
3. Non si devono scegliere conti “a intuito”.
4. Le causali devono essere classificate prima dall'anagrafica e solo in fallback da codice legacy.
5. Le scritture generiche senza IVA e senza partitario devono richiedere solo i controlli minimi coerenti con RM-01.
6. Le causali IVA, documentali, con partitario o ritenute devono applicare controlli più stretti coerenti con la funzione fiscale reale.
7. Ogni blocco funzionale deve essere leggibile dall'operatore.
8. Ogni flusso deve distinguere chiaramente:
   - bozza
   - controllabile
   - confermata
   - scrivibile
9. Nessuna logica fiscale deve essere nascosta in scorciatoie non tracciabili.
10. L'obiettivo di prodotto è un gestionale italiano avanzato senza invio telematico, quindi con:
    - contabilità generale
    - IVA
    - partitario
    - scadenzario
    - ritenute/CU/770 predisposti
    - F24 predisposto
    - cespiti
    - bilancio
    - riconciliazione bancaria
    - audit operatore
