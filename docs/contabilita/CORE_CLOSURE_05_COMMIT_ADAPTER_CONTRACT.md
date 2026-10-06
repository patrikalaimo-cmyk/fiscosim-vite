# CORE_CLOSURE_05 — Commit Adapter Contract

Questo contratto simula il futuro motore atomico `commit_canonical_accounting_payload` senza database reale, RPC reale o interfaccia utente.

## Cosa simula

- validazione input minima;
- hash canonico del payload;
- idempotenza su `idempotencyKey` + `payload_hash`;
- replay deterministico;
- conflict idempotente;
- audit in memoria;
- dry run;
- commit mock;
- rollback mock.

## Cosa non fa

- non scrive su DB;
- non esegue SQL;
- non chiama Supabase;
- non tocca runtime o UI;
- non implementa il motore reale.

## Idempotenza

- stessa chiave + stesso hash => `replayed`;
- stessa chiave + hash diverso => `blocked` con `idempotency_conflict`;
- il replay restituisce gli stessi `createdIds` e `resultSnapshot` del primo commit.

## Rollback mock

- i fallimenti simulati cancellano i record creati nella singola chiamata;
- l’audit conserva traccia del fallimento con `failed_rollback` o `failed`.

## Prossimi step

- collegare il mock ai contract test dei tre moduli sorgente;
- mantenere stabile il payload canonico;
- usare lo stesso schema quando sarà disponibile la RPC reale.
