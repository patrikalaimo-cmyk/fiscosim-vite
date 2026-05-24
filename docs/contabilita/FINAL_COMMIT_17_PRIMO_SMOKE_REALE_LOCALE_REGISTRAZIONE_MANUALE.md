# FINAL-COMMIT-17 - Chiusura documentale e guard finali primo smoke reale locale: Registrazione manuale

## Scopo

Chiudere formalmente il primo smoke reale locale della Registrazione manuale con evidenza documentale, guard finali e build.

## Pre-check

Lo smoke reale locale era gia stato eseguito con successo in una fase precedente della stessa sessione, con esito finale:

- dry-run ok;
- `--execute` ok;
- 1 `prima_nota` creata;
- 2 `prima_nota_righe` create;
- replay idempotente verificato;
- cleanup eseguito;
- rollback verificato;
- `primaNotaExists = false`;
- `primaNotaRigheCount = 0`;
- nessun `documenti_contabilita`;
- nessun `documenti_import`;
- nessun `partitario`;
- nessun `movimenti_bancari`;
- nessun remoto;
- nessuna UI;
- nessun Import;
- nessuna Riconciliazione.

## Dry-run

Comando eseguito:

```powershell
node scripts/dev/smoke-manual-registration-real-local.mjs
```

Esito:

- `ok: true`
- `execute: false`
- `status: dry_run`
- `warnings: ["dry_run_only", "dev_local_direct_preview_only"]`
- `noDbWriteInDryRun: true`
- `cleanupPlan` presente

## Guard finali

Comandi eseguiti:

```powershell
node scripts/dev/test-canonical-real-commit-contract.mjs
node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs
node scripts/dev/test-manual-registration-atomic-commit-contract.mjs
node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs
```

Esito:

- `test-canonical-real-commit-contract.mjs`: PASS 14 / 14
- `test-canonical-real-commit-no-unsafe-write.mjs`: PASS
- `test-manual-registration-atomic-commit-contract.mjs`: PASS 10 / 10
- `test-manual-registration-no-unsafe-real-save.mjs`: PASS

## Build

Comando eseguito:

```powershell
npm run build
```

Esito:

- build completata con successo
- warning Vite solo su dimensione chunk, non bloccante

## Record creati

Nel primo smoke reale locale sono stati creati:

- 1 `prima_nota`
- 2 `prima_nota_righe`

## Replay idempotente

Verificato nello smoke reale locale:

- stesso payload
- stessa idempotency key
- replay riconosciuto
- nessuna duplicazione

## Cleanup

Cleanup eseguito con successo:

1. `prima_nota_righe`
2. `prima_nota`
3. eventuali tabelle opzionali saltate se assenti

Esito finale:

- `primaNotaExists = false`
- `primaNotaRigheCount = 0`
- residui zero

## Tabelle vietate non toccate

Nel primo smoke reale locale non risultano toccate:

- `documenti_contabilita`
- `documenti_import`
- `partitario`
- tabelle bancarie
- memoria AI
- target di riconciliazione
- target import-staging

## Nessun remoto

Confermato:

- nessun DB remoto
- nessun deploy
- nessun `db push`
- nessun `db reset`
- nessuna migration remota
- nessun `git push`

## Nessuna UI

Confermato:

- nessuna UI coinvolta nello smoke reale locale
- nessun Import Contabilita
- nessuna Riconciliazione bancaria

## Rischi residui

- Lo smoke resta locale e dipende dal contesto Supabase locale.
- Il cleanup e il rollback sono stati verificati, ma il primo smoke reale resta un percorso delicato da ripetere solo con perimetro controllato.
- Le tabelle opzionali vengono saltate se assenti: questo e atteso nel setup locale.

## Verdetto

**FINAL-COMMIT-17 chiusa con esito positivo.**

Il primo smoke reale locale della Registrazione manuale e stato eseguito, verificato, pulito e documentato.
