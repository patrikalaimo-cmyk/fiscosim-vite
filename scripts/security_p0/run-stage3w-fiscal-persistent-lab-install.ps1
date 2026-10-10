# Stage3W persistent LAB installation — ONLY after explicit operator consent
# AND a verified Stage3W reversible rehearsal PASS on the same container.
# Does NOT modify Stage3U. No production / LIVE connection.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [Parameter(Mandatory=$true)][switch]$ApproveLabSchemaInstall,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $ApproveLabSchemaInstall){throw 'Explicit Stage3W LAB schema-install approval is required'}
if($Container -ne 'supabase_db_FiscoSim-P0-LAB-20261008-164658' -or
 !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W persistent install refused: wrong isolated lab identity'
}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W persistent install refused: pinned commit mismatch'
}
$expectedBlobs=@{
 '57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql'='1e920b0f2aeda5cd40106395b64d41947ab013d3'
 '58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql'='988e3396d2477d65140e70f6635cab2c5dfe560a'
}
foreach($name in $expectedBlobs.Keys){
 $relative='sql/security_p0/'+$name
 $actual=(& git -C $repo hash-object -- $relative)
 if($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $expectedBlobs[$name]){
  throw ('Stage3W unreviewed SQL content detected: '+$name)
 }
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W isolated Docker LAB container is not running'
}
$proofs=@(Get-ChildItem -LiteralPath $Lab -Filter 'STAGE3W_FISCAL_REHEARSAL_*.txt' -File)
$verified=$false
foreach($proof in $proofs){
 $c=Get-Content -LiteralPath $proof.FullName -Raw
 if($c.Contains('LAB_ONLY='+$Container) -and
    $c.Contains('STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK') -and
    $c.Contains('STAGE3W_ROLLBACK_VERIFIED|NO_FISCAL_SCHEMA_PERSISTED') -and
    $c.Contains('STAGE3W_REHEARSAL_EXECUTED')){
  $verified=$true
  break
 }
}
if(-not $verified){throw 'Stage3W verified local reversible rehearsal proof is missing'}
$report=Join-Path $Lab ('STAGE3W_PERSISTENT_LAB_INSTALL_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3W installation report collision'}
$pre=@'
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_fiscal_journal_claim') IS NULL
 AND to_regprocedure(
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
 ) IS NULL
 AND (SELECT count(*) FROM public.prima_nota)=0
 AND (SELECT count(*) FROM public.prima_nota_righe)=0
 AND (SELECT count(*) FROM public.registri_iva)=0
 AND (SELECT count(*) FROM public.partitario)=0
 AND (SELECT count(*) FROM public.ritenute_dacconto)=0
 THEN '3W_INSTALL_BASELINE|EMPTY_LEDGER|NO_EXISTING_FISCAL_RPC'
 ELSE '3W_INSTALL_BASELINE|UNEXPECTED' END AS result;
ROLLBACK;
'@
$migFile=Join-Path $repo 'sql\security_p0\57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql'
$testFile=Join-Path $repo 'sql\security_p0\58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql'
$migration=Get-Content -LiteralPath $migFile -Raw -Encoding UTF8
$matrix=Get-Content -LiteralPath $testFile -Raw -Encoding UTF8
$log=New-Object System.Collections.Generic.List[string]
$log.Add('COMMIT='+$sha.Trim())
$log.Add('LAB_ONLY='+$Container)
$log.Add('PERSISTENT_SCHEMA=true')
$log.Add('FIXTURE_ROWS_ROLLBACK=true')
$log.Add('REAL_JWT_E2E=false')
$log.Add('STAGE3U_MUST_REMAIN_UNTOUCHED=true')
$log.Add('WARNING=If matrix 58 fails, SQL 57 may already be installed. DO NOT rerun automatically.')
function Invoke-LabSql {
 param([string]$Name,[string]$Payload,[string[]]$Required)
 $result=@()
 $exitCode=1
 $previous=$ErrorActionPreference
 try{
  $ErrorActionPreference='Continue'
  $result=@($Payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
   -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
  $exitCode=$LASTEXITCODE
 }finally{$ErrorActionPreference=$previous}
 $log.Add('=== '+$Name+' ===')
 foreach($line in $result){$log.Add([string]$line)}
 if($exitCode -ne 0){throw ('Stage3W SQL failed in '+$Name)}
 foreach($expected in $Required){
  if(-not ($result -contains $expected)){throw ('Stage3W missing '+$expected+' in '+$Name)}
 }
 return $null
}
try{
 Invoke-LabSql 'preflight READ ONLY' $pre @('3W_INSTALL_BASELINE|EMPTY_LEDGER|NO_EXISTING_FISCAL_RPC','ROLLBACK')
 Invoke-LabSql 'migration 57 (PERSISTENT DDL)' (
  "SET fiscosim.p0_stage3w_approval='local-fiscal-journal-atomic-candidate-only';`n"+
  $migration
 ) @('COMMIT')
 Invoke-LabSql 'matrix 58 (fixture ROLLBACK)' (
  "SET fiscosim.p0_stage3w_test_approval='local-fiscal-journal-matrix-rollback-only';`n"+
  $matrix
 ) @('STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK','ROLLBACK')
 $post=@'
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_fiscal_journal_claim') IS NOT NULL
 AND to_regprocedure(
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
 ) IS NOT NULL
 AND (SELECT count(*) FROM public.fiscosim_fiscal_journal_claim)=0
 AND (SELECT count(*) FROM public.prima_nota)=0
 AND (SELECT count(*) FROM public.registri_iva)=0
 AND (SELECT count(*) FROM public.partitario)=0
 AND (SELECT count(*) FROM public.ritenute_dacconto)=0
 AND NOT has_function_privilege('anon',
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated',
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)','EXECUTE')
 AND has_function_privilege('service_role',
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)','EXECUTE')
 AND (
  to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NULL
  OR (
   SELECT prosecdef FROM pg_proc WHERE oid=
    'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
  ) IS FALSE
 )
 THEN '3W_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS|STAGE3U_OK'
 ELSE '3W_PERSISTENT_INSTALL|POSTCHECK_FAILED' END AS result;
ROLLBACK;
'@
 Invoke-LabSql 'postflight READ ONLY' $post @('3W_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS|STAGE3U_OK','ROLLBACK')
 (@('STAGE3W_PERSISTENT_LAB_INSTALL_PASS') + $log.ToArray()) |
   Out-File -LiteralPath $report -Encoding UTF8
 Write-Host 'STAGE3W PERSISTENT LAB SCHEMA INSTALL PASS; FIXTURE ROWS ROLLED BACK' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 Write-Host 'UI wire and signed JWT fiscal posting remain NOT ENABLED'
}catch{
 (@('STAGE3W_PERSISTENT_LAB_INSTALL_BLOCKED',('ERROR='+$_.Exception.Message))+
  $log.ToArray()) | Out-File -LiteralPath $report -Encoding UTF8
 Write-Host ('BLOCKED; do NOT rerun. Report: '+$report) -ForegroundColor Yellow
 throw
}
