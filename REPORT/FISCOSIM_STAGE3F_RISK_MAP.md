# FiscoSim P0 Stage3F — rischio F24 / IVA legacy e lettura senza ambito

**Stato:** audit del codice e metadata live in sola lettura; **non** patch SQL, **non** collaudo applicativo E2E.
**Ambiente:** branch di sicurezza isolato; il database live resta intatto. Audit del clone Docker con `23_stage3f_role_only_READ_ONLY.sql`.

## Risultato Stage3E confermato dall'operatore
I test positivi/negativi su `fatture_xml` e `coda_import_fatture` nel clone Docker sono PASS; `RESIDUAL_AUTH_TRUE_POLICY_TABLES=8`; sette altri contatori dell'audit P0 a zero. Le prove sono SQL con ruolo `authenticated` simulato, non una prova browser/API.

## Problema non rilevato dal contatore delle 8 policy
L'audit P0 originale conta le condizioni letterali `true`. **Non** conta le policy permissive `auth.role() = 'authenticated'`, che non verificano appartenenza a specifica società/studio. Nei metadata live osservati sono presenti sulle tabelle:
`avvisi_ade`, `client_modules`, `client_responsabili`, `clients`, `f24_righe`, `f24_scadenze`, `liquidazioni_iva`, `studios`, `users` (nove). Nel clone Stage1 alcune grant `anon` sono già revocate, ma l'esposizione agli autenticati va comunque corretta.

## Dipendenze legacy da correggere prima delle RLS finali
- `f24_scadenze` ha `studio_id` **nullable** e il componente `src/modules/f24/index.jsx` crea la scadenza con `{label,data_scadenza,stato:'aperta'}` senza `studio_id`. La UI carica le scadenze senza filtro studio.
- `f24_righe` ha `studio_id` **nullable** e `cliente_id` riferisce `public.clients`, non `public.clienti` o `societa`. La UI legge righe per `scadenza_id` e aggiorna i record direttamente.
- `liquidazioni_iva` usa `public.clients` e `public.studios` legacy, con `studio_id` **nullable**. Il modulo `src/modules/iva/index.jsx` legge la lista senza filtro studio. Non va confusa con la contabilità canonica/definitiva.
- `public.users` ha `studio_id` legato a `public.studios`. Lo studio moderno usa anche `utenti_studio`, `utenti_studio_societa`, `auth.users`. La relazione autoritativa e il percorso di migrazione fra i due modelli vanno dimostrati, non presunti.
- `public.user_has_societa_access` consente accesso globale per `owner/admin`; il modello multi-studio resta da delimitare. Non confondere il PASS positivo sui due collaboratori con certificazione cross-studio.
- `utenti_studio.password_hash` è ancora una colonna accessibile da `authenticated` via SELECT sul profilo permesso dalla RLS. La pagina legacy `src/modules/utenti/index.jsx` interroga `select('*')`. Eliminare letture/trasferimenti di credenziali dal browser e adottare un perimetro dati esplicito.

## Matrice residui / piano sicuro
| Gruppo | Tabelle | Percorso necessario |
|---|---|---|
| F24 / IVA legacy | `f24_righe`, `f24_scadenze`, `liquidazioni_iva` | Collegare utente↔studio autenticato e cliente↔studio; assegnare `studio_id` server-side, gestire dati legacy NULL; policy per studio/cliente e ruoli; test 2 studi / 2 clienti, insert/update/delete + E2E UI |
| Revisioni | `revisioni_dichiarativi` | Usare `company_id`/ownership in maniera coerente; vietare `NULL` senza percorso di migrazione; verificare UI che salva revisione |
| Invii | `invii_log` | Derivare per via vincolata lo scope da `invii_schedulati` e relativi clienti; evitare accesso indistinto |
| Dataset e test | `test_cases`, `test_datasets`, `test_runs` | Separare schema di QA / accesso amministrativo; nessun permesso trasversale libero a utenti autenticati |

## Gate P0 prima di produzione
1. Conservare snapshot e rollback riproducibili; nessuna migrazione diretta al progetto reale.
2. Migrare o bloccare i record legacy senza studio/azienda assegnata; non scegliere uno studio di default in silenzio.
3. Test con due studi distinti e almeno due utenti con `auth.users` separati; ogni lettura e scrittura deve filtrare sullo studio/azienda giusto e sui privilegi funzionali.
4. Test con access token reale/API, non solo `SET ROLE` + `request.jwt.claim.sub`.
5. E2E UI Import XML/ZIP/P7M, F24, liquidazione IVA, prima nota, libri e stampe; quadrature contabili e fiscalità da certificare separatamente.
6. Audit di `service_role`, RPC privilegiate, storage e campo credenziali; divieto di esporre `service_role` nei browser.

**Nota:** contatori di audit non sostituiscono l'analisi delle policy semanticamente permissive. La Stage3F non deve pretendere di essere un altro intervento correttivo finché mancano le mappature reali.
