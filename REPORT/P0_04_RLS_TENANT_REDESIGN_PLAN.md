# P0-04 — Piano redesign RLS tenant (post anon containment)

Stato: 2026-10-13. LIVE anon DML/SELECT/EXECUTE = 0 (T1+T2). Residuo A100: policy `USING (true)` su ruolo `authenticated`/`public`.

## Inventario (fonte)

- `scripts/security_p0/run-live-p0-readonly-audit.mjs` → `BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC` + dettaglio `BROAD_AUTH_POLICY`.
- Baseline post-T2: ~31 (conteggio T2); rieseguire audit per snapshot corrente.

## Classi di rischio

| Classe | Esempi LIVE | Azione proposta |
|---|---|---|
| A — fiscale core | `prima_nota_righe`, `documenti_contabilita`, `liquidazioni_iva`, `causali_*` | Sostituire con membership `utenti_studio_societa` + `societa_id` (pattern Stage3K/Q) |
| B — anagrafica / studio | `utenti_studio` (`public_access`), `impostazioni_studio` | Solo self/admin; mai `public` true |
| C — import / coda | `documenti_import`, `coda_import_fatture`, `fatture_xml` | Scope per `societa_id` + ruolo |
| D — test/lab residue | `test_cases`, `test_datasets`, `test_runs` | DROP su LIVE o revoke authenticated; tenere solo LAB |
| E — adempimenti/F24/deleghe | `adempimenti_*`, `f24_*`, `deleghe_uniche`, `invii_*` | Tenant + ruolo; non bloccano contabilità ma restano A100 |

## Sequenza sicura (no silent LIVE)

1. **LAB only** su volume `supabase_db_FiscoSim-P0-LAB-20261008-164658`: inventory `04_residuals_READ_ONLY.sql`.
2. Draft SQL `LAB_ONLY` per classe D (test_*) poi A (core fiscale) — una tranche per PR.
3. Smoke Stage3W L6 + login UI LAB dopo ogni tranche.
4. Solo con autorizzazione esplicita: dump + apply LIVE tranche N (stesso modello T1/T2).
5. Freeze A100 sicurezza solo quando `BROAD_TRUE_POLICIES_AUTH_OR_PUBLIC=0` (o esclusione formale documentata).

## Vietato

- DROP policy LIVE senza backup + consenso.
- Riapplicare `63_*` / `64_*` containment (già fatti).
- Dichiarare A100 con allow_all authenticated ancora presenti.
