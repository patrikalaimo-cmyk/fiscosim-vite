# Fase R9B-SPEC - Funzione atomica commit riconciliazione bancaria

## Obiettivo

Questa specifica definisce la futura funzione atomica `commit_reconciliation_canonical_payload` per il commit reale sicuro del `payload canonico` di riconciliazione bancaria.

La fase attuale non abilita alcun commit reale. Il risultato è un contratto tecnico per evitare sequenze di write separate e per imporre transazione, idempotencyKey e audit commit dedicato.

## Vincolo di sicurezza

Il commit reale diretto resta vietato finché non esistono contemporaneamente:

1. transazione reale o rollback sicuro;
2. idempotenza reale;
3. repository canonici coerenti;
4. assenza di percorsi legacy;
5. nessuna reinterpretazione del payload.

Se uno di questi requisiti manca, il sistema deve restare su `dry_run` / mock e non deve scrivere dati reali.

## Evidenze già disponibili

- `R8 canonicalPayload` esiste e rimane la sorgente canonica per il commit.
- `R9A commit service` esiste solo in modalità `dry_run` / mock.
- Il repository espone primitive per `prima nota`, `prima nota righe`, `partitario` e aggiornamento `movimenti_bancari`.
- Lo schema contiene tabelle coerenti per `prima_nota`, `prima_nota_righe`, `partitario` e `movimenti_bancari`.
- Non risulta presente una funzione atomica server-side che unisca queste write in un'unica transazione.

## Architettura scelta

Scelta raccomandata: **RPC PostgreSQL/Supabase atomica**.

Motivo: la funzione SQL può eseguire la transazione implicita del database, garantire rollback completo su errore e concentrare l'idempotenza in un solo punto.

Un eventuale endpoint server-side futuro può limitarsi a validare input e chiamare l'RPC; non deve replicare la logica di commit.

## Firma funzionale proposta

```text
commit_reconciliation_canonical_payload(
  societaId,
  esercizioId,
  utenteId,
  movementId,
  decisionId,
  idempotencyKey,
  canonicalPayload
)
```

### Campi input attesi nel payload

- `source = riconciliazione_bancaria`
- `valid = true`
- `sourceDecisionStatus = accepted | ignored`
- `blockers = []`
- `warnings = []` opzionale
- `primaNota`, `primaNotaRighe`, `partitarioMovements` se il caso è contabile
- `audit` con metadati canonici

## Struttura tabella audit commit proposta

Tabella: `reconciliation_commit_audit`

### Campi minimi

- `id`
- `societa_id`
- `esercizio_id`
- `movement_id`
- `decision_id`
- `idempotency_key` UNIQUE
- `payload_id`
- `status`
- `mode`
- `prima_nota_id`
- `created_ids` jsonb
- `payload_snapshot` jsonb
- `result_snapshot` jsonb
- `warnings` jsonb
- `blockers` jsonb
- `created_by`
- `created_at`

### Campi consigliati aggiuntivi

- `supported_case`
- `source`
- `source_decision_status`
- `commit_version`
- `error_code`
- `error_snapshot` jsonb

## Campi aggiuntivi proposti su movimenti_bancari

Lo schema `movimenti_bancari` già contiene parte della semantica utile, ma per il commit canonico servono riferimenti espliciti e stabili.

### Da verificare o aggiungere se mancanti

- `stato_riconciliazione`
- `riconciliato_da`
- `riconciliato_at`
- `prima_nota_id`
- `partita_id`
- `documento_id`
- `reconciliation_decision_id`
- `reconciliation_commit_audit_id`

### Nota

Nel modello attuale alcuni di questi campi esistono già nello schema bancario; la specifica li conferma come vincoli canonici e ne chiede l'uso esplicito dall'RPC atomica.

## Vincoli di idempotenza proposti

### Obbligatori

- `UNIQUE(idempotency_key)` su `reconciliation_commit_audit`
- lookup preventivo per `movement_id + decision_id + idempotency_key`

### Consigliati

- vincolo unico parziale sui commit riusciti, ad esempio su `(societa_id, movement_id, decision_id)` quando `status = 'committed'`
- eventuale vincolo su `movement_id` se il modello di business consente un solo commit finale per movimento

## Flusso transazionale step-by-step

1. Validare i parametri obbligatori e il `payload canonico`.
2. Verificare che `source = riconciliazione_bancaria`.
3. Verificare che `valid = true`.
4. Verificare che `sourceDecisionStatus` sia `accepted` o `ignored`.
5. Verificare che i `blockers` siano assenti.
6. Cercare in `reconciliation_commit_audit` un record con la stessa `idempotencyKey`.
7. Se il record esiste, restituire il `result_snapshot` precedente senza duplicare nulla.
8. Se `sourceDecisionStatus = ignored`, aggiornare il `movimenti_bancari` a `ignored`, salvare l'audit commit e terminare senza creare `prima_nota`.
9. Se il caso è contabile, creare `prima_nota`.
10. Creare `prima_nota_righe` collegate alla nuova `prima_nota`.
11. Creare eventuali movimenti `partitario` derivati dal `payload canonico`.
12. Aggiornare `movimenti_bancari` a `reconciled` / `confermato` con i riferimenti creati.
13. Scrivere `reconciliation_commit_audit` con snapshot e ID generati.
14. In caso di errore, l'intera transazione deve annullarsi.

## Gestione ignored

Il caso `ignored` è un commit non contabile:

- aggiorna solo lo stato del movimento bancario;
- scrive audit commit;
- non crea `prima_nota`;
- non crea `prima_nota_righe`;
- non crea `partitario`.

## Gestione casi contabili supportati

La funzione atomica futura deve accettare solo i casi già supportati da R9A:

- incasso cliente;
- pagamento fornitore;
- spesa bancaria;
- ignored.

Per i casi contabili, l'RPC deve creare solo i record canonici previsti dal `payload canonico` senza reinterpretazioni legacy.

## Casi ancora bloccati

Restano bloccati finché non esiste una mapping canonica esplicita e testata:

- IVA per cassa reale;
- ritenute reali;
- F24 reale;
- casi cumulativi;
- giroconti complessi;
- scenari che richiedono servizi legacy o reinterpretazione del payload.

## Policy / RLS proposte

La produzione non deve usare policy permissive `allow_all`.

### Principi

- accesso sempre vincolato a `societa_id`;
- scrittura consentita solo al lato server con service role;
- lettura del commit audit solo alle funzioni autorizzate o al backoffice amministrativo;
- le funzioni RPC devono usare `SECURITY DEFINER` e `search_path` controllato.

### Obiettivo

Impedire che un client UI possa aggirare la funzione atomica o scrivere direttamente tabelle di commit.

## Collegamento futuro con R9A

L'adapter R9A già separa:

- planner;
- preview `dry_run`;
- validazione;
- mock transactional adapter.

La futura integrazione dovrà sostituire solo il backend adapter con la RPC atomica, mantenendo invariati:

- `idempotencyKey`;
- `payload canonico`;
- audit commit;
- risultati `dry_run`.

In altre parole, R9A resta il contratto applicativo; R9B aggiunge il motore atomico server-side.

## Rischi residui

- differenze tra schema effettivo e schema atteso dalla funzione atomica;
- policy RLS troppo permissive se non corrette prima del rilascio;
- idempotenza parziale se la chiave non viene materializzata in audit;
- commit bancari duplicati se il vincolo unico non è enforced;
- gap tra payload canonico e colonne reali di `movimenti_bancari`.

## Prossimo step consigliato

Redigere e revisionare il draft SQL/RPC sotto forma di migration non applicata, poi verificare con test mock che il contratto `commit_reconciliation_canonical_payload` sia compatibile con R9A senza modificare la UI.

## Conferme

- Nessuna migration è stata applicata.
- Nessun commit reale è stato eseguito.
- Nessuna UI è stata modificata.