-- FiscoSim P0 Stage 2 — EXPERIMENTAL LOCAL LAB ONLY (NOT LIVE).
-- The 5 legacy views aggregate accounting_entries rather than canonical prima_nota;
-- do not certify tenant-safe financial reports from these views, even when invoker.
-- Four RLS-disabled tables lack tenant policies. Enable RLS with deny-by-default:
-- this intentionally may stop legacy operations until safely refactored.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE n integer;
BEGIN
  IF current_setting('fiscosim.p0_stage2_lab_approval', true)
     IS DISTINCT FROM 'local-only-views-rls' THEN
    RAISE EXCEPTION 'P0 stage2 DENIED: local lab approval is missing';
  END IF;
  SELECT count(*) INTO n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p');
  IF n <> 73 THEN RAISE EXCEPTION 'P0 stage2 unexpected public table count %', n; END IF;
  SELECT count(*) INTO n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='v'
    AND c.relname = ANY(ARRAY[
     'v_accounting_entry_righe','mastrini','bilancio_stato_patrimoniale',
     'bilancio_conto_economico','bilancio']);
  IF n <> 5 THEN RAISE EXCEPTION 'P0 stage2 view baseline drift: %', n; END IF;
  SELECT count(*) INTO n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
    AND c.relname = ANY(ARRAY[
      'ai_feedback_log','ai_learning','partitari','test_scenarios']);
  IF n <> 4 THEN RAISE EXCEPTION 'P0 stage2 RLS baseline drift: %', n; END IF;
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.prosecdef
    AND has_function_privilege('anon',p.oid,'EXECUTE');
  IF n <> 0 THEN RAISE EXCEPTION 'P0 stage2 prior RPC containment missing: %', n; END IF;
END
$guard$;

-- Legacy views do not filter per active societa, deny unsafe API access.
REVOKE SELECT ON TABLE
  public.v_accounting_entry_righe, public.mastrini,
  public.bilancio_stato_patrimoniale, public.bilancio_conto_economico,
  public.bilancio
FROM PUBLIC, anon, authenticated;

-- Defense in depth if these views are later re-granted.
ALTER VIEW public.v_accounting_entry_righe SET (security_invoker = true);
ALTER VIEW public.mastrini SET (security_invoker = true);
ALTER VIEW public.bilancio_stato_patrimoniale SET (security_invoker = true);
ALTER VIEW public.bilancio_conto_economico SET (security_invoker = true);
ALTER VIEW public.bilancio SET (security_invoker = true);

-- No policies existed on these four in the inspected live baseline.
-- Allow no direct API rows until per-table, per-societa policies are authored.
ALTER TABLE public.ai_feedback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partitari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_scenarios ENABLE ROW LEVEL SECURITY;

DO $assert$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind='v'
    AND (has_table_privilege('anon',c.oid,'SELECT')
      OR has_table_privilege('authenticated',c.oid,'SELECT')
      OR NOT EXISTS (
         SELECT 1 FROM pg_options_to_table(c.reloptions) opt
         WHERE opt.option_name='security_invoker' AND opt.option_value='true'
      ));
  IF n <> 0 THEN RAISE EXCEPTION 'P0 stage2 view security failure: %',n; END IF;
  SELECT count(*) INTO n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname=ANY(ARRAY['ai_feedback_log','ai_learning','partitari','test_scenarios'])
    AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION 'P0 stage2 table RLS failure: %',n; END IF;
END
$assert$;
COMMIT;
