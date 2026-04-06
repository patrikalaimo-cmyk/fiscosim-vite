-- Tre scenari E2E predefiniti.
-- expected_results "soft": senza pipeline_phases strict — se pipeline_runs non è migrato, runId è null
-- e pipeline_steps resta vuoto (confronto fallirebbe). Con pipeline ok si verifica comunque pipeline.completed.

insert into public.test_scenarios (id, nome, descrizione, steps, expected_results, attivo, kind, critical_tags)
values (
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'E2E · Singola fattura passiva',
  'Flusso utente: carica XML → pipeline (parsing … insight) → apri scritture → valida esito.',
  $steps1$[
    {"action": "upload_xml"},
    {"action": "run_pipeline", "aiMode": "local", "aiPreprocessMode": "on"},
    {"action": "open_entry"},
    {"action": "validate"}
  ]$steps1$::jsonb,
  $exp1${
    "pipeline": {"completed": true},
    "accounting_entries": {"min_count": 0},
    "partitari": {"min_count": 0},
    "registri_iva": {"min_count": 0},
    "insights": {"min_total": 0}
  }$exp1$::jsonb,
  true,
  'standard',
  array['pipeline']::text[]
)
on conflict (id) do update set
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  steps = excluded.steps,
  expected_results = excluded.expected_results,
  attivo = excluded.attivo,
  kind = excluded.kind,
  critical_tags = excluded.critical_tags;

insert into public.test_scenarios (id, nome, descrizione, steps, expected_results, attivo, kind, critical_tags)
values (
  'b0000000-0000-4000-8000-000000000002'::uuid,
  'E2E · Fatture multiple (batch)',
  'Simula più import consecutivi: per ogni XML, insert documento + pipeline completa come in produzione. In Test Mode seleziona almeno 3 file XML (anche copie dello stesso file).',
  $steps2$[
    {"action": "batch_upload_pipeline", "max": 5, "aiMode": "local", "aiPreprocessMode": "on"},
    {"action": "open_entry"},
    {"action": "validate"}
  ]$steps2$::jsonb,
  $exp2${
    "batch_summary": {"min_documents": 3},
    "accounting_entries": {"min_count": 0},
    "pipeline": {"completed": true}
  }$exp2$::jsonb,
  true,
  'standard',
  array['pipeline']::text[]
)
on conflict (id) do update set
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  steps = excluded.steps,
  expected_results = excluded.expected_results,
  attivo = excluded.attivo,
  kind = excluded.kind,
  critical_tags = excluded.critical_tags;

insert into public.test_scenarios (id, nome, descrizione, steps, expected_results, attivo, kind, critical_tags)
values (
  'c0000000-0000-4000-8000-000000000003'::uuid,
  'E2E · Ciclo completo (IVA + liquidazione)',
  'Una fattura: pipeline completa. Per controlli rigidi su pipeline_steps (parsing…insights) applica migration pipeline_runs e imposta expected_results con pipeline_phases.',
  $steps3$[
    {"action": "upload_xml"},
    {"action": "run_pipeline", "aiMode": "local", "aiPreprocessMode": "on"},
    {"action": "open_entry"},
    {"action": "validate"}
  ]$steps3$::jsonb,
  $exp3${
    "pipeline": {"completed": true},
    "accounting_entries": {"min_count": 0},
    "partitari": {"min_count": 0},
    "registri_iva": {"min_count": 0},
    "insights": {"min_total": 0}
  }$exp3$::jsonb,
  true,
  'intelligent',
  array['pipeline', 'iva']::text[]
)
on conflict (id) do update set
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  steps = excluded.steps,
  expected_results = excluded.expected_results,
  attivo = excluded.attivo,
  kind = excluded.kind,
  critical_tags = excluded.critical_tags;
