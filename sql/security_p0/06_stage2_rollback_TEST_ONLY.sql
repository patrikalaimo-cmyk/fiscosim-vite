-- DANGEROUS TEST-ONLY ROLLBACK — restores previously observed insecure views/RLS.
-- NEVER APPLY TO THE REAL PROJECT. Only within fresh isolated P0 Docker lab.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage2_lab_rollback_approval',true)
    IS DISTINCT FROM 'local-test-rollback-only' THEN
   RAISE EXCEPTION 'stage2 rollback DENIED outside explicit local test';
 END IF;
END
$guard$;
ALTER VIEW public.v_accounting_entry_righe RESET (security_invoker);
ALTER VIEW public.mastrini RESET (security_invoker);
ALTER VIEW public.bilancio_stato_patrimoniale RESET (security_invoker);
ALTER VIEW public.bilancio_conto_economico RESET (security_invoker);
ALTER VIEW public.bilancio RESET (security_invoker);
GRANT SELECT ON TABLE
 public.v_accounting_entry_righe, public.mastrini,
 public.bilancio_stato_patrimoniale, public.bilancio_conto_economico,
 public.bilancio
TO anon, authenticated;
ALTER TABLE public.ai_feedback_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.partitari DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_scenarios DISABLE ROW LEVEL SECURITY;
COMMIT;
