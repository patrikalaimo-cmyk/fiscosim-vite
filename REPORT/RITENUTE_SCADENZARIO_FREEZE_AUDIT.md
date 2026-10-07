# RITENUTE-SCADENZARIO-FREEZE — AUDIT

Data: 2026-10-08

## Obiettivo

Congelare il ciclo operativo ritenute nel perimetro A100 corrente usando un solo linguaggio contabile:

parcella professionista -> pagamento contabilizzato -> maturazione ritenuta -> debito Erario -> scadenza -> dati CU/770.

Il pagamento deve transitare dal workflow contabile canonico. La vista fiscale Ritenute non può costituire un percorso alternativo di scrittura.

## Audit del ciclo canonico

Il percorso Manuale verificato:
1. registra la parcella e predispone i dati ritenuta;
2. non considera maturato il debito fiscale al solo documento;
3. al pagamento integrale collega la partita e genera la scrittura contabile coerente;
4. chiude il partitario;
5. matura la ritenuta senza duplicare il record;
6. registra data pagamento, codice tributo, scadenza e riferimenti Prima Nota;
7. alimenta lo scadenzario e i dati derivati CU/770 dalla stessa base.

La regola di progetto resta: il debito verso Erario nasce all'effettivo pagamento della parcella.

## Bypass legacy trovato e rimosso

La precedente `RitenuteView` in `TaxComplianceView.jsx` esponeva un comando "Nuovo pagamento" che:
- inseriva direttamente un record in `ritenute_dacconto`;
- poteva aggiornare direttamente il documento;
- non passava da Prima Nota;
- non chiudeva il partitario tramite il workflow canonico.

Era quindi un secondo dialetto contabile incompatibile con l'architettura A100.

Correzione:
- la vista Ritenute è ora sola lettura;
- mostra esclusivamente lo scadenzario derivato dai pagamenti contabilizzati;
- non crea, modifica o elimina pagamenti/ritenute;
- il pagamento resta nel workflow contabile dedicato.

## Guardrail fiscali aggiunti

### Aliquota ritenuta

Non viene più dedotta da parole presenti in descrizioni o causali.

La priorità accetta il primo valore positivo esplicitamente configurato tra:
1. override/draft operatore;
2. default causale;
3. anagrafica percipiente.

Se nessun valore positivo è disponibile, l'aliquota resta 0 e la validazione blocca la registrazione.

### CU/770

Lo stato "pronto" richiede anche il codice fiscale del percipiente. Un pagamento con CF mancante resta da verificare.

### Tenant scope

Le letture operative ritenute verificate sono filtrate per `societa_id`.

## Scadenzario

Il servizio derivato espone:
- percipiente;
- parcella;
- data pagamento;
- scadenza;
- codice tributo;
- importo ritenuta;
- stato operativo;
- riferimenti Prima Nota;
- readiness CU/770.

È coperto anche il passaggio anno: pagamento di dicembre -> scadenza 16 gennaio dell'anno successivo.

## Limite residuo esplicito: pagamento parziale

Il pagamento parziale di una parcella soggetta a ritenuta **non è dichiarato supportato** nel freeze corrente.

Il validator lo blocca esplicitamente con:
`pagamento parziale ritenute non ancora supportato`.

Questo comportamento è preferibile a una maturazione fiscale errata o ambigua, ma costituisce un gap funzionale residuo A100.

Decisione di roadmap:
- il blocco RITENUTE-SCADENZARIO può essere congelato sul caso integrale e sullo scadenzario;
- il supporto ai pagamenti parziali con ritenuta resta requisito residuo da risolvere o escludere formalmente prima di RELEASE A100;
- non viene nascosto nel debito di collaudo manuale.

## F24

FiscoSim non introduce in questo freeze un compilatore F24 autonomo.

Lo scadenzario predispone importo, codice tributo e scadenza. Il versamento e l'eventuale futuro controllo contro F24 importati restano eventi separati, coerentemente con la roadmap generale.

## Gate automatico

Commit hardening:
- `56b173b05ae9b2d84f0993318ba91d382ecee642`
- `9fb3b04782a7dc41d8846022a69746e15e530130`

GitHub Actions:
- run `37697140035`

Esito:
- Ubuntu: PASS;
- Windows: PASS;
- Import: PASS;
- Manuale: PASS;
- Consultazione: PASS;
- IVA: PASS;
- Split: PASS;
- Ritenute: PASS;
- Core: PASS;
- All safe: PASS;
- build: PASS.

Profilo dedicato:
- `npm run test:ritenute`
- 4 file;
- 27 test;
- PASS su entrambi i sistemi operativi.

## Sicurezza

Non sono state:
- applicate migration;
- modificate variabili env;
- modificate auth/RLS/policy;
- effettuate scritture su società reali;
- avviate attività di Riconciliazione Bancaria.

## Stato

**AUTOMATICO VERDE / MANUALE PENDENTE**

Il collaudo browser resta tracciato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

Prossimo blocco:
**STAMPE-EXPORT-FASCICOLO**.

Riconciliazione Bancaria:
**BLOCCATA**.
