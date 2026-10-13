-- SG-P0-04 LIVE class F — drop TRUE policies with non-true twin
BEGIN;
DO $body$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tablename, t.policyname
    FROM pg_policies t
    WHERE t.schemaname='public'
      AND (lower(btrim(coalesce(t.qual,'')))='true' OR lower(btrim(coalesce(t.with_check,'')))='true')
      AND (t.roles @> ARRAY['public']::name[] OR t.roles @> ARRAY['authenticated']::name[])
      AND EXISTS (
        SELECT 1 FROM pg_policies s
        WHERE s.schemaname='public' AND s.tablename=t.tablename
          AND s.policyname <> t.policyname
          AND lower(btrim(coalesce(s.qual,''))) <> 'true'
          AND lower(btrim(coalesce(s.with_check,''))) <> 'true'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'DROPPED % on %', r.policyname, r.tablename;
  END LOOP;
END
$body$;
COMMIT;
