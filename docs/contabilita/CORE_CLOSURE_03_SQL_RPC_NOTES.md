# CORE-CLOSURE-03 SQL/RPC Notes

## Cosa contiene il draft

- una proposta di tabella audit commit canonica;
- gli indici minimi per lookup per società, esercizio, sorgente e stato;
- campi sorgente/target proposti come commenti di allineamento;
- uno skeleton della funzione `commit_canonical_accounting_payload`;
- note su idempotenza, payload hash, rollback, RLS e grant.

## Cosa non fa

- non applica migration;
- non esegue SQL;
- non collega adapter JS;
- non modifica runtime o UI;
- non abilita commit reale.

## Prerequisiti prima dell'applicazione

- verifica dello schema reale delle tabelle coinvolte;
- verifica delle colonne gia presenti;
- verifica di `pgcrypto` o del meccanismo hash scelto;
- verifica delle policy RLS e dei ruoli server-side;
- definizione finale del payload canonico effettivo.

## Rischi da validare

- campi duplicati rispetto allo schema esistente;
- vincoli troppo forti che possano bloccare retry validi;
- hashing non deterministico se il payload non viene normalizzato bene;
- policy RLS permissive che aprano il perimetro di scrittura;
- differenze tra draft e schema reale delle tabelle target.

## Prossimi step

1. confrontare il draft con lo schema reale;
2. definire la forma finale del payload normalizzato;
3. trasformare il draft in migration separata solo dopo review;
4. preparare test mock/contract per idempotenza, replay e rollback.