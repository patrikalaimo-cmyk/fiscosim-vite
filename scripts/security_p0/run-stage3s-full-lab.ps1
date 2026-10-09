# Stage3Q/R/S: ONE complete isolated PostgreSQL LAB install + QA.
# Runs ONLY on the pinned Docker container and SHA; never touches live Supabase.
# Stages 45/47/49/50/51 are persisted in LAB. Fixture data rolls back.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3S LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3S pinned commit mismatch: no SQL executed'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3S isolated LAB container inactive'
}
$report=Join-Path $Lab 'STAGE3S_FULL_LAB_RESULT.txt'
if(Test-Path -LiteralPath $report){
 $report=Join-Path $Lab ('STAGE3S_FULL_LAB_RESULT_'+
  (Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
 if(Test-Path -LiteralPath $report){throw 'Stage3S report collision; abort'}
}
$lines=New-Object System.Collections.Generic.List[string]
$lines.Add('COMMIT='+$ExpectedCommit)
$lines.Add('LAB_ONLY='+$Container)
$lines.Add('NOTICE=Stage3S AgeCon sequence nextval may advance even after test ROLLBACK')

function Invoke-PsqlStage {
 param([string]$File,[string]$Setting,[string]$Approval,[string]$ExpectedEnd)
 $path=Join-Path $repo ('sql\security_p0\'+$File)
 if(!(Test-Path -LiteralPath $path -PathType Leaf)){
  throw ('Required SQL file missing: '+$File)
 }
 $payload="SET $Setting = '$Approval';`n"+(Get-Content -LiteralPath $path -Raw -Encoding UTF8)
 $result=@($payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
   -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
 $code=$LASTEXITCODE
 $script:lines.Add('=== '+$File+' ===')
 foreach($l in $result){$script:lines.Add([string]$l)}
 if($code -ne 0){throw ('Stage3S SQL failed: '+$File)}
 if(-not ($result -contains $ExpectedEnd)){
  throw ('Stage3S SQL missing '+$ExpectedEnd+': '+$File)
 }
 Write-Host ('PASS: '+$File) -ForegroundColor Green
}

try{
 # Baseline guard: requires Stage3P installed EMPTY and Stage3Q not applied.
 $pre=@'
BEGIN READ ONLY;
SELECT '3S_BASELINE|'||
 (SELECT count(*) FROM public.clienti)::text||'|'||
 (SELECT count(*) FROM public.avvisi_ade)::text||'|'||
 (SELECT count(*) FROM public.revisioni_dichiarativi)::text||'|'||
 (SELECT count(*) FROM public.crm_cliente_societa_link)::text||'|'||
 (SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename='clienti' AND policyname='clienti_company_boundary')::text;
ROLLBACK;
'@
 $out=@($pre | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
  -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
 if($LASTEXITCODE -ne 0 -or -not ($out -contains '3S_BASELINE|0|0|0|0|0')){
  throw 'Stage3S baseline not empty or Stage3Q already exists; no SQL applied'
 }
 $lines.Add('STAGE3S_BASELINE_PASS')

 Invoke-PsqlStage '45_stage3q_fiscal_owner_rls_LAB_ONLY.sql' `
  'fiscosim.p0_stage3q_approval' 'local-explicit-fiscal-row-ownership-only' 'COMMIT'
 Invoke-PsqlStage '46_stage3q_two_company_fiscal_TEST_ONLY.sql' `
  'fiscosim.p0_stage3q_test_approval' 'local-fiscal-ownership-matrix-rollback-only' 'ROLLBACK'
 Invoke-PsqlStage '47_stage3r_atomic_client_create_LAB_ONLY.sql' `
  'fiscosim.p0_stage3r_approval' 'local-atomic-crm-link-rpc-only' 'COMMIT'
 Invoke-PsqlStage '48_stage3r_atomic_client_create_TEST_ONLY.sql' `
  'fiscosim.p0_stage3r_test_approval' 'local-atomic-client-rpc-rollback-fixture' 'ROLLBACK'
 Invoke-PsqlStage '49_stage3s_shared_crm_update_LAB_ONLY.sql' `
  'fiscosim.p0_stage3s_approval' 'local-shared-crm-update-only' 'COMMIT'
 Invoke-PsqlStage '50_stage3s_agecon_write_LAB_ONLY.sql' `
  'fiscosim.p0_stage3s_agecon_approval' 'local-agecon-atomic-upsert-only' 'COMMIT'
 Invoke-PsqlStage '51_stage3s_declaration_archive_LAB_ONLY.sql' `
  'fiscosim.p0_stage3s_revisions_approval' 'local-atomic-declaration-archive-only' 'COMMIT'
 Invoke-PsqlStage '52_stage3s_mutation_matrix_TEST_ONLY.sql' `
  'fiscosim.p0_stage3s_mutation_test_approval' 'local-stage3s-fiscal-mutations-rollback-only' 'ROLLBACK'

 $final=@'
BEGIN READ ONLY;
SELECT '3S_FINAL|'||
 (SELECT count(*) FROM public.clienti)::text||'|'||
 (SELECT count(*) FROM public.avvisi_ade)::text||'|'||
 (SELECT count(*) FROM public.revisioni_dichiarativi)::text||'|'||
 (SELECT count(*) FROM public.crm_cliente_societa_link)::text||'|'||
 (SELECT count(*) FROM public.fiscosim_operational_audit)::text||'|'||
 (SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('clienti','avvisi_ade','revisioni_dichiarativi')
  AND permissive='RESTRICTIVE')::text;
ROLLBACK;
'@
 $out=@($final | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
  -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
 foreach($l in $out){$lines.Add([string]$l)}
 if($LASTEXITCODE -ne 0 -or -not ($out -contains '3S_FINAL|0|0|0|0|0|3')
  -or -not ($out -contains 'ROLLBACK')){
  throw 'Stage3S final sealed, empty tables and 3 restrictive RLS not verified'
 }
 @('STAGE3S FULL LAB PASS')+$lines.ToArray() |
  Out-File -LiteralPath $report -Encoding UTF8
 Write-Host 'STAGE3S FULL LAB PASS' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 Write-Host 'No live Supabase access. No customer fixtures persisted.'
 Write-Host 'Signed JWT/API/UI E2E remains untested.'
}catch{
 @('STAGE3S FULL LAB FAIL',('FAILED_STEP='+$_.Exception.Message))+
  $lines.ToArray() | Out-File -LiteralPath $report -Encoding UTF8
 throw
}
