# FINAL-COMMIT-18 - Consolidamento percorso reale locale Registrazione manuale non IVA

## Scopo

Consolidare il percorso reale locale della Registrazione manuale non IVA dopo il primo smoke riuscito, rendendolo ripetibile, sicuro, verificabile e pronto per lo scenario IVA successivo.

## Scenario consolidato

- `sourceModule = registrazione_manual`
- `scenario = simple_non_iva`
- `idempotencyKey = manual-smoke-local-simple-non-iva-v1`
- 2 righe
- Dare 100
- Avere 100
- nessuna IVA
- nessun documento
- nessun partitario
- nessuna banca

## Pre-check

Verifiche di contesto eseguite prima del consolidamento:

- il primo smoke reale locale era gia stato chiuso con successo;
- il cleanup precedente aveva lasciato residui zero;
- il perimetro resta solo Registrazione manuale;
- nessuna UI, nessun Import Contabilita, nessuna Riconciliazione.

## Hardening dello smoke

Lo script dev locale [scripts/dev/smoke-manual-registration-real-local.mjs](../../scripts/dev/smoke-manual-registration-real-local.mjs) e stato consolidato con:

- dry-run come default;
- `--execute` esplicito per la write locale;
- `--cleanup` idempotente;
- preflight sui residui della stessa `idempotencyKey`;
- stop esplicito se esistono residui prima di `--execute`;
- report piu chiaro con scenario fisso e target locali;
- rifiuto del target remoto tramite controllo su `SUPABASE_URL`.

## Comandi eseguiti

```powershell
node scripts/dev/smoke-manual-registration-real-local.mjs --cleanup
node scripts/dev/smoke-manual-registration-real-local.mjs
node scripts/dev/smoke-manual-registration-real-local.mjs --execute
node scripts/dev/test-canonical-real-commit-contract.mjs
node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs
node scripts/dev/test-manual-registration-atomic-commit-contract.mjs
node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs
npm run build
```

## Esito dry-run

Il dry-run e rimasto il comportamento di default e ha prodotto:

- `ok: true`
- `execute: false`
- `cleanup: false`
- `status: dry_run`
- `warnings: ["dry_run_only", "dev_local_direct_preview_only"]`
- `noDbWriteInDryRun: true`
- `cleanupPlan` presente

## Esito cleanup idempotente

Il comando `--cleanup` e risultato idempotente:

- nessun residuo trovato;
- nessuna tabella scritta;
- nessun audit residuo;
- nessuna `prima_nota` residua;
- nessuna `prima_nota_righe` residua.

## Esito execute locale

Il comando `--execute` sullo stesso scenario non IVA e riuscito:

- `status: committed`
- `primaNotaId` creato localmente
- `primaNotaRigheIds` create: 2
- replay idempotente verificato
- cleanup eseguito
- rollback verificato
- residui finali zero

## Record creati

Nel giro reale locale sono stati creati:

- 1 `prima_nota`
- 2 `prima_nota_righe`

## Replay idempotente

Verificato:

- stessa `idempotencyKey`
- stesso payload
- nessuna duplicazione
- replay riconosciuto dal flusso smoke

## Cleanup e rollback

Il cleanup ha rimosso con successo:

1. `prima_nota_righe`
2. `prima_nota`

Verifica finale:

- `primaNotaExists = false`
- `primaNotaRigheCount = 0`
- `registriIvaCount = 0`
- `partitarioCount = 0`
- `documentiContabilitaCount = 0`
- `documentiImportCount = 0`
- `movimentiBancariCount = 0`

## Tabelle vietate non toccate

Nel consolidamento non risultano toccate:

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
- nessun `db push`
- nessun `db reset`
- nessuna migration remota
- nessun deploy
- nessun `git push`

## Nessuna UI

Confermato:

- nessuna UI toccata
- nessun Import Contabilita
- nessuna Riconciliazione bancaria

## Guard finali

I guard finali sono passati:

- `test-canonical-real-commit-contract.mjs`: PASS 14 / 14
- `test-canonical-real-commit-no-unsafe-write.mjs`: PASS
- `test-manual-registration-atomic-commit-contract.mjs`: PASS 10 / 10
- `test-manual-registration-no-unsafe-real-save.mjs`: PASS

## Build finale

`npm run build` e stato eseguito con esito positivo.

## Rischi residui

- Il percorso resta locale e dipende dal contesto Supabase locale.
- Il cleanup e il rollback sono stati verificati, ma restano operazioni da usare solo sullo scenario non IVA consolidato.
- Il salto allo scenario IVA richiedera un nuovo perimetro e nuovi guard.

## Verdetto

**FINAL-COMMIT-18 chiusa con esito positivo.**

Il percorso reale locale della Registrazione manuale non IVA e ora consolidato, ripetibile e documentato.
