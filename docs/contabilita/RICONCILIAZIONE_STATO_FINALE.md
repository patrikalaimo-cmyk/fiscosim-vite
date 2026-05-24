# Riconciliazione bancaria - Stato finale

## Cosa è operativo

- Matcher puro R7B: 16/16 PASS.
- Decisione locale R7D: 80/80 PASS.
- Mapper canonico R8: 16/16 PASS.
- Commit base R9A in dry_run/mock: 16/16 PASS.
- Working View locale con azioni `accept`, `needs_review`, `ignored`, `cancelled` e blocco per i casi non accettabili.
- Demo R7B isolata dal flusso reale.
- Staging unico con salvataggio e ripristino demo visibili in UI.

## Cosa resta mock / dry_run

- Commit reale non collegato.
- Nessuna write reale dal modulo riconciliazione bancaria verso un commit atomico.
- Adapter transazionale solo mock.
- `idempotencyKey` presente nel contratto, ma non ancora materializzato in una RPC atomica.

## Cosa è bloccato

- Casi complessi: IVA per cassa reale, ritenute reali, F24 reale, cumulativi, giroconti complessi.
- Percorsi legacy vietati: `accounting_entries`, `documenti_import`, `import_fatture`, `import_nuovo`, `import_unificato`.
- Commit reale diretto dalla UI.
- Sequenze di write separate al posto di una funzione atomica.

## Test disponibili e verificati

- `node scripts/dev/test-riconciliazione-matching.mjs` - 16/16 PASS.
- `node scripts/dev/test-riconciliazione-decisions.mjs` - 80/80 PASS.
- `node scripts/dev/test-riconciliazione-canonical-payload.mjs` - 16/16 PASS.
- `node scripts/dev/test-riconciliazione-commit-base.mjs` - 16/16 PASS.
- `npm run build` - PASS con soli warning di dimensione chunk Vite.

## Divieti architetturali confermati

- Nessun commit reale collegato alla UI.
- Nessuna migration applicata per il commit atomico.
- Nessun uso di servizi legacy per il flusso nuovo di riconciliazione.
- Nessuna reinterpretazione del payload canonico.
- Nessun accesso DB/API dalla UI per il commit reale.

## Prossimi step futuri

- Implementare la RPC atomica server-side descritta in `RICONCILIAZIONE_COMMIT_ATOMICO_SPEC.md`.
- Materializzare `reconciliation_commit_audit` con vincolo di idempotenza reale.
- Allineare la UI solo dopo esistenza della funzione atomica e validazione di sicurezza.

## Nota finale

Lo stato corrente è stabile: il modulo è completo fino al livello mock/dry_run e pronto per la futura fase atomica server-side, ma il commit reale resta volutamente bloccato.# Riconciliazione bancaria - Stato finale

## Cosa è operativo

- Matcher puro R7B: 16/16 PASS.
- Decisione locale R7D: 80/80 PASS.
- Mapper canonico R8: 16/16 PASS.
- Commit base R9A in dry_run/mock: 16/16 PASS.
- Working View locale con azioni `accept`, `needs_review`, `ignored`, `cancelled` e blocco per i casi non accettabili.
- Demo R7B isolata dal flusso reale.
- Staging unico con salvataggio e ripristino demo visibili in UI.

## Cosa resta mock / dry_run

- Commit reale non collegato.
- Nessuna write reale dal modulo riconciliazione bancaria verso un commit atomico.
- Adapter transazionale solo mock.
- `idempotencyKey` presente nel contratto, ma non ancora materializzato in una RPC atomica.

## Cosa è bloccato

- Casi complessi: IVA per cassa reale, ritenute reali, F24 reale, cumulativi, giroconti complessi.
- Percorsi legacy vietati: `accounting_entries`, `documenti_import`, `import_fatture`, `import_nuovo`, `import_unificato`.
- Commit reale diretto dalla UI.
- Sequenze di write separate al posto di una funzione atomica.

## Test disponibili e verificati

- `node scripts/dev/test-riconciliazione-matching.mjs` - 16/16 PASS.
- `node scripts/dev/test-riconciliazione-decisions.mjs` - 80/80 PASS.
- `node scripts/dev/test-riconciliazione-canonical-payload.mjs` - 16/16 PASS.
- `node scripts/dev/test-riconciliazione-commit-base.mjs` - 16/16 PASS.
- `npm run build` - PASS con soli warning di dimensione chunk Vite.

## Divieti architetturali confermati

- Nessun commit reale collegato alla UI.
- Nessuna migration applicata per il commit atomico.
- Nessun uso di servizi legacy per il flusso nuovo di riconciliazione.
- Nessuna reinterpretazione del payload canonico.
- Nessun accesso DB/API dalla UI per il commit reale.

## Prossimi step futuri

- Implementare la RPC atomica server-side descritta in `RICONCILIAZIONE_COMMIT_ATOMICO_SPEC.md`.
- Materializzare `reconciliation_commit_audit` con vincolo di idempotenza reale.
- Allineare la UI solo dopo esistenza della funzione atomica e validazione di sicurezza.

## Nota finale

Lo stato corrente è stabile: il modulo è completo fino al livello mock/dry_run e pronto per la futura fase atomica server-side, ma il commit reale resta volutamente bloccato.