-- SG-P0-04 LIVE class E — authorized 2026-10-13 (operator: approvo continua)
-- Drop TRUE allow_all ONLY when scoped twin already present on same table.
BEGIN;

-- Guard: each target must still have at least one non-true policy
DO $g$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ',') INTO missing
  FROM unnest(ARRAY[
    'causali_contabili','causali_iva','documenti_contabilita','documenti_import',
    'liquidazioni_iva','prima_nota_righe','utenti_studio'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=t
      AND lower(btrim(coalesce(p.qual,''))) <> 'true'
      AND lower(btrim(coalesce(p.with_check,''))) <> 'true'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'class E aborted: missing scoped twin on %', missing;
  END IF;
END
$g$;

DROP POLICY IF EXISTS causali_contabili_all ON public.causali_contabili;
DROP POLICY IF EXISTS causali_iva_all ON public.causali_iva;
DROP POLICY IF EXISTS allow_all_doc_cont ON public.documenti_contabilita;
DROP POLICY IF EXISTS "Allow all" ON public.documenti_import;
DROP POLICY IF EXISTS "Allow all operations on documenti_import" ON public.documenti_import;
DROP POLICY IF EXISTS allow_all_documenti ON public.documenti_import;
DROP POLICY IF EXISTS allow_all_liq ON public.liquidazioni_iva;
DROP POLICY IF EXISTS allow_all_pn_righe ON public.prima_nota_righe;
DROP POLICY IF EXISTS public_access ON public.utenti_studio;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'causali_contabili','causali_iva','documenti_contabilita','documenti_import',
      'liquidazioni_iva','prima_nota_righe','utenti_studio'
    )
    AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true');
  IF bad > 0 THEN
    RAISE EXCEPTION 'class E failed: % true policies remain on targeted tables', bad;
  END IF;
END
$v$;

COMMIT;
