# FINAL-COMMIT-06A - Precheck ambiente Supabase locale/dev

## Esito sintetico

L'ambiente **non è pronto** per applicare la migration in sicurezza.
La configurazione rilevata punta a **Supabase cloud/remoto** e non a un ambiente locale/dev chiaramente separato.

Verdetto: **REMOTE_LINKED_DO_NOT_APPLY**

## File letti

- [package.json](../../package.json)
- [lib/db.js](../../lib/db.js)
- [src/lib/supabase.js](../../src/lib/supabase.js)
- [supabase/](../../supabase/)
- [supabase/migrations/](../../supabase/migrations/)
- [supabase/.temp/](../../supabase/.temp/)
- [.env.local](../../.env.local)
- [docs/README.md](../README.md)
- [scripts/dev/test-canonical-rpc-migration-guard.mjs](../../scripts/dev/test-canonical-rpc-migration-guard.mjs)

## File creati o modificati

- Creato: [docs/contabilita/FINAL_COMMIT_06A_SUPABASE_ENV_PRECHECK.md](FINAL_COMMIT_06A_SUPABASE_ENV_PRECHECK.md)

## 1. Supabase CLI

- La CLI `supabase` **non risulta presente nel PATH**.
- Il controllo `Get-Command supabase` ha fallito.
- In [supabase/.temp/](../../supabase/.temp/) è presente solo `cli-latest`, ma questo non equivale a una CLI installata nel sistema.

## 2. Config locale

- [supabase/migrations/](../../supabase/migrations/) **esiste**.
- [supabase/config.toml](../../supabase/config.toml) **non è presente**.
- [supabase/.temp/](../../supabase/.temp/) **esiste**, ma contiene solo `cli-latest`.
- Non è emerso alcun `project-ref` locale nei file verificati.
- Non c'è evidenza di un setup Supabase locale completato e pronto all'apply.

## 3. Env rilevato

- [.env.local](../../.env.local) **esiste**.
- Sono presenti variabili Supabase per URL, anon key e service role, ma non viene riportato alcun valore in questo documento.
- L'URL rilevato punta a **Supabase cloud/remoto**, non a `localhost`.
- Questo è sufficiente per classificare il contesto come **remote-linked**.

## 4. Package scripts

- In [package.json](../../package.json) non esistono script Supabase dedicati.
- Non risultano script per `supabase start`, `supabase db push` o per un apply migration automatizzato.
- Sono presenti solo script applicativi e test mirati non legati all'apply del DB.

## 5. Stato DB locale

- Docker è disponibile nel sistema.
- Docker Compose è disponibile nel sistema.
- Quindi un Supabase locale sarebbe in linea di principio avviabile, **ma non è verificabile qui** perché mancano CLI e config locale completa.
- Non è stato avviato alcun database locale.

## 6. Rischio ambiente

- Classificazione: **REMOTE_LINKED_DO_NOT_APPLY**
- Motivo principale: la config env punta a Supabase cloud/remoto e non a un setup locale/dev isolato.
- Motivi secondari: CLI assente, `supabase/config.toml` assente, nessun script di apply nel repo.

## 7. SQL, migration e UI

- Migration applicata: **NO**.
- SQL eseguito: **NO**.
- UI collegata: **NO**.
- Commit reale attivato: **NO**.

## 8. Test migration guard

- Eseguito: `node scripts/dev/test-canonical-rpc-migration-guard.mjs`
- Esito: positivo.
- Messaggio ricevuto: la migration resta review-ready e non contiene write finali non sicure.

## 9. Cosa manca per FINAL-COMMIT-06

- Serve un ambiente chiaramente locale/dev.
- Serve la CLI `supabase` installata e disponibile nel PATH.
- Serve una configurazione locale esplicita, idealmente con `supabase/config.toml`.
- Serve una decisione operativa separata dal progetto cloud remoto prima di qualsiasi apply.

## 10. Comando futuro consigliato

Da eseguire **solo dopo** aver preparato un ambiente locale/dev separato e verificato:

```bash
supabase start
supabase db push
```

Nota: questo comando non è stato eseguito e non va usato finché l'ambiente resta remote-linked o non verificato.

## 11. Istruzioni per FINAL-COMMIT-06

1. Installare manualmente la CLI Supabase se manca.
2. Creare o verificare un setup locale/dev separato.
3. Aggiungere `supabase/config.toml` solo nel contesto locale previsto.
4. Rieseguire questo precheck.
5. Solo se il verdetto diventa `SAFE_LOCAL_READY`, procedere con l'applicazione della migration.

## 12. Verdetto finale

**FINAL-COMMIT-06A: C**

L'ambiente è rilevato come remote-linked e non è ancora sicuro per l'applicazione della migration.