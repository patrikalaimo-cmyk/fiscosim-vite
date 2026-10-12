# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** LIVE P0-04 tranche 1+2 **APPLICATE** su `mlydfspmrkaedsocubku` (anon DML/SELECT public=0; SECURITY DEFINER anon EXECUTE=0). Residuo sicurezza: 31 policy broad authenticated/public (richiede redesign RLS tenant). A100 non dichiarabile senza deploy nuovo + collaudi manuali.
* **Branch:** `feat/studio-grade-accounting-e2e-20261010`
* **HEAD:** (pin)
* **Limite:** policy allow_all; deploy produzione; Import #11 e form Manuale/IVA/Consultazione

## 2. Prossimo passo operativo (verso A100)
1. Smoke LIVE post-tranche2 (login + Contabilità)
2. Piano deploy unico (sostituire siti marzo/aprile) dal branch Studio Grade
3. Collaudi manuali residui in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`
4. Redesign RLS tenant per rimuovere allow_all (blocco qualità A100 sicurezza)

## 3. Evidenze
* `REPORT/LIVE_P0_04_TRANCHE2_APPLY_2026-10-12T2340.txt`
* `REPORT/LIVE_P0_04_CONTAINMENT_APPLY_2026-10-12T2331.txt`