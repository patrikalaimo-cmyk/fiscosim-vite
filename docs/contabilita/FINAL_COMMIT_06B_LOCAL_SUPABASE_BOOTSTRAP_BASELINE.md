# FINAL-COMMIT-06B - Baseline locale post-bootstrap Supabase

## Stato finale

- `FINAL-COMMIT-06A = A`
- bootstrap locale Supabase completato

## Stato Supabase locale

Esito sintetico di `npx supabase status`:

- local development setup is running
- Studio: `http://127.0.0.1:54323`
- Project URL: `http://127.0.0.1:54321`
- REST: `http://127.0.0.1:54321/rest/v1`
- GraphQL: `http://127.0.0.1:54321/graphql/v1`
- Edge Functions: `http://127.0.0.1:54321/functions/v1`
- Database URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Servizi stoppati ma non bloccanti: `supabase_imgproxy_fiscosim-local`, `supabase_pooler_fiscosim-local`

## Bootstrap migration aggiunte nella fase 06A

- `20260403110000_legacy_clienti_compat.sql`
- `20260404190000_prima_nota_base_bootstrap.sql`
- `20260412090000_documenti_contabilita_base_bootstrap.sql`
- `20260412090500_access_scope_base_tables_bootstrap.sql`
- `20260412091000_partitario_base_bootstrap.sql`
- `20260412110000_utenti_studio_base_bootstrap.sql`
- `20260412124000_societa_base_bootstrap.sql`
- `20260412125000_accounting_fiscal_base_tables_bootstrap.sql`
- `20260412125500_regole_automatiche_base_bootstrap.sql`
- `20260412125600_liquidazioni_iva_righe_base_bootstrap.sql`
- `20260412125700_f24_base_bootstrap.sql`
- `20260412125800_residual_rls_policy_tables_bootstrap.sql`

## Fix colonne importanti

- `documenti_import.societa_destinazione_id`
- `utenti_studio.permessi`
- `utenti_studio.clienti_assegnati`
- `documenti_contabilita.societa_id` senza FK prematura verso `public.societa`

## Conferme di sicurezza

- Nessun DB remoto toccato.
- Nessun SQL live remoto eseguito.
- Nessuna UI collegata.
- Commit reale ancora non attivo.
- RPC review-ready ma non applicata al remoto.
- Il bootstrap è solo locale/dev.

## Esito verifiche

- `npx supabase status`: PASS
- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`: PASS
- `node scripts/dev/test-canonical-rpc-contract.mjs`: PASS
- `node scripts/dev/test-canonical-real-commit-contract.mjs`: PASS
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`: PASS
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`: PASS
- `npm run build`: PASS

## Rischi residui

- I servizi `imgproxy` e `pooler` risultano stoppati, ma non bloccanti nello stato locale attuale.
- Lo schema bootstrap locale è avviabile, ma non va confuso con uno schema produzione definitivo.
- Possono esistere differenze tra bootstrap locale e DB remoto reale.
- La build produce un warning su chunk Vite molto grandi, ma non blocca l'esito.
- Il commit reale via RPC non è ancora abilitato.

## Prossimo step consigliato

Non fare altri fix al buio. Passare a una fase controllata di test applicativi locali/no-write, poi valutare il mapping tra schema locale bootstrap e schema remoto reale. Solo dopo decidere se e come portare eventuali migration controllate sul remoto.

## Verdetto

**FINAL-COMMIT-06B: A**

Il bootstrap locale Supabase è confermato, i guard principali passano, la build passa e il risultato è documentato.