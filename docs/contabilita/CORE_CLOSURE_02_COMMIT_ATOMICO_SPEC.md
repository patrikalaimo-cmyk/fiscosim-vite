# CORE-CLOSURE-02 — Specifica operativa commit atomico comune

## 1. Scopo

Questa specifica definisce il motore atomico comune `commit_canonical_accounting_payload` come unico canale autorizzato per il commit reale dei dati contabili finali.

Il motore comune dovrà essere il punto di convergenza per:
- Import Contabilità;
- Registrazione manuale;
- Riconciliazione bancaria.

La funzione non sostituisce i moduli sorgente: li obbliga invece a produrre un solo payload canonico e a demandare il commit finale a un unico motore atomico, idempotente e auditato.

## 2. Fuori perimetro

Sono esplicitamente esclusi da questa fase:
- nuove feature funzionali;
- AI o nuove logiche di suggerimento;
- UX/UI;
- commit diretto dal frontend;
- migration applicata;
- commit reale già eseguito;
- gestione completa di casi complessi non ancora supportati.

Fuori perimetro restano anche:
- refactor larghi;
- reinterpretazioni legacy del payload;
- write path separati per modulo;
- qualunque target finale non canonico.

## 3. Firma logica funzione

Firma proposta:

```text
commit_canonical_accounting_payload({
  societaId,
  esercizioId,
  utenteId,
  sourceModule,
  sourceDocumentId,
  idempotencyKey,
  canonicalPayload,
  options
})
```

### `sourceModule` ammessi

- `import_contabilita`
- `registrazione_manual`
- `riconciliazione_bancaria`

### `options`

- `dryRun`
- `allowRealCommit`
- `expectedPayloadVersion`
- `requestId`

## 4. Output standard

Output standard atteso:

```json
{
  "success": true,
  "mode": "dry_run | commit",
  "status": "dry_run | committed | replayed | blocked | failed_rollback | failed",
  "idempotencyKey": "...",
  "payloadId": "...",
  "sourceModule": "...",
  "sourceDocumentId": "...",
  "createdIds": {},
  "reusedExistingCommit": false,
  "warnings": [],
  "blockers": [],
  "auditId": "...",
  "resultSnapshot": {}
}
```

### Semantica `status`

- `dry_run`: il payload è stato validato e pianificato, ma non scritto;
- `committed`: commit atomico eseguito con successo;
- `replayed`: stessa `idempotencyKey` e stesso payload hash, risultato precedente restituito;
- `blocked`: validazione o guardia pre-commit hanno fermato il commit;
- `failed_rollback`: errore durante il commit con rollback non completato o non verificabile;
- `failed`: errore non classificato o fallimento tecnico prima del commit.

## 5. Tabella audit commit

Tabella proposta: `canonical_accounting_commit_audit`

### Campi minimi

- `id`
- `societa_id`
- `esercizio_id`
- `utente_id`
- `source_module`
- `source_document_id`
- `idempotency_key` unique
- `payload_id`
- `payload_version`
- `payload_hash`
- `mode`
- `status`
- `created_ids` jsonb
- `payload_snapshot` jsonb
- `result_snapshot` jsonb
- `warnings` jsonb
- `blockers` jsonb
- `error_message`
- `created_at`
- `updated_at`

### Campi consigliati

- `commit_version`
- `source_payload_version`
- `source_module_version`
- `source_decision_status`
- `rollback_snapshot` jsonb
- `error_code`
- `request_id`
- `tenant_scope_snapshot` jsonb

## 6. Idempotenza

L’idempotenza è obbligatoria.

Regole:
- `idempotencyKey` è obbligatoria per ogni commit reale o replay;
- la chiave deve essere unica in audit;
- se la chiave esiste già e il `payload_hash` coincide, il motore deve restituire il risultato precedente senza duplicare nulla;
- se la chiave esiste già ma il `payload_hash` è diverso, il motore deve bloccare con `idempotency_conflict`;
- retry e doppio click devono produrre lo stesso risultato già materializzato.

## 7. Payload hash

Il `payload_hash` deve essere deterministico e calcolato sul `canonicalPayload` normalizzato.

Regole operative:
- serializzare il payload in forma canonica e stabile;
- rimuovere campi transitori non semantici;
- ordinare chiavi e collezioni dove necessario;
- produrre un hash stabile confrontabile nel tempo;
- usare l’hash come protezione contro il riuso improprio di una stessa `idempotencyKey` con payload diverso.

Obiettivo:
- impedire che una chiave già usata possa autorizzare un payload differente.

## 8. Validazione pre-commit

Il motore deve bloccare il commit se una delle seguenti condizioni è vera:

- `societaId` mancante;
- `esercizioId` mancante;
- `utenteId` mancante;
- `sourceModule` non ammesso;
- `canonicalPayload` mancante;
- `expectedPayloadVersion` incompatibile;
- `canonicalPayload` invalido;
- `blockers` presenti;
- `sourceModule` e tipo payload incoerenti;
- caso non supportato dal modulo sorgente;
- riferimenti legacy presenti;
- tenant scope incoerente.

La validazione pre-commit deve essere conservativa: in dubbio, blocca.

## 9. Operazioni transazionali previste

Il motore atomico deve poter creare o aggiornare, dentro la stessa transazione:
- `prima_nota`;
- `prima_nota_righe`;
- `registri_iva`;
- `partitario`;
- `ritenute`;
- `movimento_bancario` status update;
- `documenti_contabilita` status update;
- `audit commit`.

Ogni write finale deve stare nella stessa transazione. Nessun write finale può essere spezzato in più passaggi client-side.

## 10. Casi supportati fase iniziale

La fase iniziale deve supportare solo i casi minimi già allineati al contratto canonico.

### Import Contabilità

- fattura cliente ordinaria;
- fattura fornitore ordinaria;
- multi-IVA semplice;
- professionista solo se la ritenuta è già completa e validata; altrimenti blocker.

### Registrazione manuale

- movimento semplice;
- fattura cliente;
- fattura fornitore;
- pagamento/incasso;
- parcella solo se il payload ritenuta è completo; altrimenti blocker.

### Riconciliazione bancaria

- incasso cliente;
- pagamento fornitore;
- spesa bancaria;
- ignored.

## 11. Casi bloccati inizialmente

Devono essere bloccati fin dall’inizio:
- F24 reale;
- IVA per cassa reale se non completamente mappata;
- ritenute incomplete;
- reverse charge complesso;
- cumulativi;
- giroconti complessi;
- source senza `idempotencyKey`;
- payload con riferimenti sintetici non risolti;
- legacy references.

## 12. Gestione ignored

Nel caso `ignored` della riconciliazione bancaria:
- non si crea `prima_nota`;
- si aggiorna solo lo stato del `movimento_bancario`;
- si scrive l’audit commit;
- il risultato deve essere idempotente.

## 13. Rollback

Regole di rollback:
- qualunque errore durante il commit deve annullare tutto;
- nessuna scrittura parziale deve restare visibile come esito finale;
- il sistema può scrivere `failed_rollback` solo se l’errore di rollback è tecnicamente rilevabile e il commit non è stato completato;
- se la transazione non può essere garantita, il motore deve fallire in sicurezza.

`failed_rollback` è uno stato critico e deve essere sempre segnalato con priorità alta.

## 14. Legacy guard

Il motore deve rifiutare payload che contengano riferimenti a:
- `accounting_entries` come target;
- `documenti_import` come archivio contabile finale;
- `import_fatture`, `import_nuovo`, `import_unificato` come source di commit reale;
- `createScritturaContabile`.

Qualunque riferimento legacy rilevato deve produrre `blocked`.

## 15. Multi-tenant / RLS

Regole multi-tenant:
- `societaId` deve essere coerente su ogni record sorgente e target;
- nessuna write cross-company è consentita;
- service role solo lato server;
- policy `allow_all` non ammesse per i target finali in produzione;
- test cross-company obbligatorio.

La sicurezza multi-tenant è parte del contratto, non un controllo accessorio.

## 16. Adapter applicativo

Futuro adapter JS proposto:

```text
commitCanonicalAccountingPayloadAdapter(payload, context)
```

Comportamento atteso:
- non scrive direttamente;
- chiama solo RPC/server-side function;
- gestisce `dryRun`;
- interpreta l’output standard;
- non reinterpreta il payload.

L’adapter resta un ponte tecnico; la logica di commit reale deve stare nel motore atomico server-side.

## 17. Test minimi obbligatori

I test minimi da pretendere prima della chiusura sono:
- commit singolo positivo;
- retry stessa `idempotencyKey` stesso payload;
- retry stessa chiave con payload diverso = `blocked`;
- errore a metà commit = rollback completo;
- doppio click UI = replay;
- cross-company = blocked;
- legacy payload = blocked;
- `sourceModule` non ammesso = blocked;
- `ignored` = nessuna `prima_nota` + aggiornamento movimento;
- casi complessi = blocked.

## 18. Applicazione ai 4 moduli

### Import Contabilità

Cosa deve produrre:
- payload canonico con `sourceModule = import_contabilita`;
- `prima_nota`, `prima_nota_righe`, `registri_iva`, `partitario` se supportati dal caso.

Cosa non deve più fare:
- commit finale separato;
- uso di `documenti_import` come archivio contabile finale;
- write dirette dal frontend.

Blocker da applicare:
- payload non canonico;
- `idempotencyKey` assente;
- casi non supportati;
- riferimenti legacy.

### Registrazione manuale

Cosa deve produrre:
- payload canonico con `sourceModule = registrazione_manual`;
- `prima_nota` e, se previsto, `registri_iva`, `partitario`, `ritenute`.

Cosa non deve più fare:
- uso di write legacy dal vecchio hub;
- bypass del motore atomico comune.

Blocker da applicare:
- `createScritturaContabile`;
- payload incompleto;
- ritenute parziali;
- casi complessi non supportati.

### Riconciliazione bancaria

Cosa deve produrre:
- payload canonico con `sourceModule = riconciliazione_bancaria`;
- `prima_nota` solo per i casi contabili supportati;
- aggiornamento del `movimento_bancario`;
- audit commit persistente.

Cosa non deve più fare:
- commit reale separato per step;
- aggiornamenti spezzati client-side.

Blocker da applicare:
- payload non validato;
- `ignored` non coerente;
- casi complessi non supportati;
- mismatch tra decisione e payload.

### Consultazione Prima Nota

Cosa deve produrre:
- nessun write path diretto;
- soltanto lettura e dettaglio.

Cosa non deve più fare:
- edit fuori commit canonico;
- salvataggi diretti;
- bypass della chiusura canonica.

Blocker da applicare:
- qualunque tentativo di write dal modulo consultazione.

## 19. Roadmap implementativa successiva

La sequenza raccomandata è:

1. `CORE-CLOSURE-03` — schema audit/idempotenza;
2. `CORE-CLOSURE-04` — draft RPC atomica;
3. `CORE-CLOSURE-05` — adapter mock/contract test;
4. `CORE-CLOSURE-06` — integrazione Registrazione manuale;
5. `CORE-CLOSURE-07` — integrazione Import Contabilità;
6. `CORE-CLOSURE-08` — integrazione Riconciliazione bancaria;
7. `CORE-CLOSURE-09` — RLS e test cross-company;
8. `CORE-CLOSURE-10` — baseline finale.

## 20. Decisione finale

Regola conclusiva:

Nessun modulo può essere considerato chiuso al 100% finché il commit reale non passa da questo motore atomico comune.

Questo è il solo punto autorizzato a scrivere dati contabili finali, con commit atomico, idempotencyKey persistente, audit commit persistente e rollback completo.