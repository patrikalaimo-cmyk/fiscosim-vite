# CORE-CLOSURE-01 — Audit finale gap P0 e commit atomico comune

## Stato di partenza

I quattro moduli motore contabili hanno una base tecnica avanzata, ma la chiusura operativa reale richiede ancora una normalizzazione della scrittura finale.

Moduli coinvolti:
- Import Contabilità
- Consultazione Prima Nota
- Registrazione manuale
- Riconciliazione bancaria

## Verdetto tecnico attuale

Il sistema è già oltre la fase prototipale, ma non è ancora un gestionale contabile completamente chiuso sul lato write path.

Le aree già buone sono:
- payload canonici già presenti o quasi allineati;
- flussi guided/canonici già preferiti ai legacy path;
- commit preview/dry run e mock disponibili dove serve;
- audit documentali e testing base già presenti.

Le aree ancora P0 sono quelle che rendono sicura una scrittura reale a prova di doppio click, retry, multi-tenant e rollback.

## Gap P0 da chiudere

### 1. Commit atomico comune

Serve un solo motore di commit reale per:
- Import Contabilità;
- Registrazione manuale;
- Riconciliazione bancaria.

Questo motore deve eseguire la scrittura finale come unità transazionale unica, senza sequenze di write separate nel client.

### 2. IdempotencyKey persistente

L'idempotenza deve essere materializzata in un archivio persistente dedicato, non solo calcolata in memoria o nel planner.

### 3. Audit commit persistente

Ogni commit reale deve lasciare una traccia persistente con:
- input canonico;
- esito;
- idempotencyKey;
- riferimenti creati;
- errori o warning se presenti.

### 4. Rollback completo

Se un passaggio fallisce, non devono restare scritture parziali.

### 5. RLS e policy multi-tenant più sicure

Le policy permissive legacy non sono compatibili con una chiusura contabile reale.

### 6. Isolamento definitivo legacy paths

I flussi nuovi devono poter usare solo il contratto canonico.

I legacy path devono rimanere bloccati o marcati come deprecated, non riattivabili per errore.

### 7. Test end-to-end sulla scrittura reale

Servono test su:
- commit reale;
- rollback;
- retry/doppio click;
- cross-company isolation;
- no regression su legacy call site.

## Commit atomico comune: scelta tecnica

La scelta più robusta resta una RPC server-side atomica, idealmente PostgreSQL/Supabase, con responsabilità unica di commit.

Motivi:
- la transazione è realmente unica;
- rollback nativo;
- idempotenza centralizzata;
- audit commit nello stesso punto;
- riduzione del rischio di write spezzate tra client e server.

## Contratto comune proposto

Firma logica:

```text
commit_canonical_accounting_payload(
  societaId,
  esercizioId,
  utenteId,
  sourceModule,
  sourceDocumentId,
  idempotencyKey,
  canonicalPayload
)
```

## Obblighi della funzione atomica

La funzione deve:
- validare il payload canonico;
- verificare company scope e multi-tenant;
- verificare se esiste già un commit per la stessa idempotencyKey;
- creare i record target previsti dal payload;
- scrivere audit persistente;
- restituire un risultato deterministico in caso di retry.

## Strati di responsabilità

### Strato 1: modulo sorgente

Ogni modulo produce solo payload canonico e non scrive direttamente tabelle finali.

### Strato 2: planner/validator

Il planner decide cosa verrà scritto, ma non effettua il commit reale.

### Strato 3: motore atomico

L'RPC server-side esegue il commit reale, l'audit e il rollback.

## Roadmap implementativa concreta

### Fase A — Audit contrattuale e freeze dei legacy path

Obiettivo:
- bloccare qualsiasi nuovo call site legacy;
- congelare il contratto canonico;
- allineare i quattro moduli a un solo canale di commit.

Deliverable:
- guard statici per i call site vietati;
- commenti deprecation sui servizi legacy;
- documentazione del flusso canonico unico.

### Fase B — Idempotenza e audit persistenti

Obiettivo:
- rendere persistente l'idempotencyKey;
- rendere persistente l'audit commit;
- permettere replay sicuro del risultato precedente.

Deliverable:
- tabella audit commit dedicata;
- chiave univoca idempotente;
- lookup preventivo prima della scrittura;
- snapshot input/output.

### Fase C — RPC atomica comune

Obiettivo:
- sostituire i write path distribuiti con un unico commit atomico server-side.

Deliverable:
- funzione RPC/migration non applicata come draft;
- adapter applicativo per Import/Manuale/Riconciliazione;
- rollback verificato in caso di errore.

### Fase D — RLS e isolamento tenant

Obiettivo:
- chiudere i buchi di accesso cross-company;
- eliminare policy permissive sui target finali.

Deliverable:
- policy restrittive per società;
- test di isolamento cross-company;
- verifica che il client non possa scrivere direttamente le tabelle di commit.

### Fase E — Suite e2e di chiusura

Obiettivo:
- prevenire regressioni su commit reale, rollback e retry.

Deliverable:
- test commit reale con rollback;
- test doppio click e retry idempotente;
- test isolamento multi-società;
- test che i legacy call site restino assenti.

## Applicazione ai 4 moduli

### Import Contabilità

Stato attuale:
- staging e payload buoni;
- commit finale da blindare.

Chiusura richiesta:
- usare il commit atomico comune;
- usare audit e idempotenza persistenti;
- evitare scritture spezzate dal frontend.

### Consultazione Prima Nota

Stato attuale:
- vicino alla chiusura perché prevalentemente read-only.

Chiusura richiesta:
- bloccare edit fuori flusso canonico;
- rifinire performance, export e dettaglio;
- garantire che la UI non esponga write path indiretti.

### Registrazione manuale

Stato attuale:
- flusso guidato operativo;
- legacy hub bloccato;
- guard anti-regressione attivo.

Chiusura richiesta:
- far passare il commit reale solo dal motore atomico comune;
- garantire rollback completo;
- rendere idempotente il doppio invio.

### Riconciliazione bancaria

Stato attuale:
- dry run, mock e spec atomica già presenti;
- commit reale ancora bloccato correttamente.

Chiusura richiesta:
- sostituire il mock con RPC atomica reale;
- mantenere invariato il contratto canonico;
- introdurre audit commit persistente e idempotenza reale.

## Test minimi da pretendere prima della chiusura

- commit reale singolo con esito positivo;
- retry con stessa idempotencyKey che restituisce lo stesso esito;
- doppio click UI che non duplica record;
- rollback completo su errore in mezzo al commit;
- commit cross-company rifiutato;
- legacy call site rilevato e bloccato dal guard.

## Rischi residui

- gap tra contratto canonico e schema reale delle tabelle di commit;
- policy RLS ancora troppo permissive in alcune tabelle legacy;
- idempotenza non materializzata in modo uniforme tra i moduli;
- rischio di duplicazione se un adapter bypassa la funzione atomica;
- rischio di drift documentale se i moduli vengono aggiornati senza riallineare il contratto.

## Conclusione operativa

La chiusura tecnica non richiede nuove feature funzionali.

Richiede invece:
- un solo commit atomico comune;
- idempotenza persistente;
- audit persistente;
- rollback garantito;
- RLS più sicura;
- guard anti-regressione sui legacy path.

Con questi cinque blocchi chiusi, i quattro moduli possono essere considerati tecnicamente allineati a un gestionale contabile avanzato e non più a una baseline avanzata.