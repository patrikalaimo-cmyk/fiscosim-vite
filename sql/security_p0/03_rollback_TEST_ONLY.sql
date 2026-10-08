-- TEST-ONLY emergency rollback of the isolated P0 containment candidate.
-- INSECURE BY DESIGN: restores observed legacy anonymous exposure.
-- Never execute against real customer databases as a remediation strategy.
-- Preferred recovery for live is verified point-in-time backup/rollback.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF current_setting('fiscosim.p0_isolated_rollback_approved', true)
     IS DISTINCT FROM 'approved-test-reversal-only' THEN
    RAISE EXCEPTION 'Rollback denied: explicit isolated-test reversal approval missing';
  END IF;
END
$guard$;

-- Restore the exact broad policies observed prior to test containment.
CREATE POLICY "causali_contabili_all" ON public.causali_contabili
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "causali_iva_all" ON public.causali_iva
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_doc_cont" ON public.documenti_contabilita
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.documenti_import
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on documenti_import" ON public.documenti_import
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_documenti" ON public.documenti_import
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pn_righe" ON public.prima_nota_righe
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_access" ON public.utenti_studio
  AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

-- Restore the original anon table ACLs on the 26 staging objects.
GRANT ALL PRIVILEGES ON TABLE
  public.adempimenti_clienti, public.adempimenti_template, public.avvisi_ade,
  public.causali_contabili, public.causali_iva, public.coda_import_fatture,
  public.deleghe_uniche, public.documenti_contabilita, public.documenti_import,
  public.f24_righe, public.f24_scadenze, public.fatture_xml,
  public.impostazioni_studio, public.invii_log, public.invii_schedulati,
  public.liquidazioni_iva, public.prima_nota_righe, public.richieste_fatture,
  public.test_cases, public.test_datasets, public.test_runs,
  public.utenti_studio, public.ai_feedback_log, public.ai_learning,
  public.partitari, public.test_scenarios
TO anon;

-- Restores observed SQL EXECUTE ACLs. This makes test branch unsafe again.
GRANT EXECUTE ON FUNCTION
  public.apply_ai_learning_from_feedback(uuid,uuid,uuid,numeric),
  public.consolida_periodo_iva_transazionale(uuid,date,date,text,uuid,text,jsonb),
  public.consolidazione_stampa_definitiva(uuid,text,integer,date,date,uuid,text,text,jsonb),
  public.precheck_stampa_definitiva(uuid,text,integer,date,date),
  public.rpc_annulla_prima_nota_logica(uuid,uuid,text,uuid),
  public.rpc_get_prima_nota_operation_guards(uuid,uuid,text),
  public.rpc_storna_prima_nota_generale(uuid,uuid,text,date,uuid),
  public.rpc_update_prima_nota_generale_controllata(uuid,uuid,jsonb,jsonb,text,uuid)
TO PUBLIC, anon, authenticated;
COMMIT;
