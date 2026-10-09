# Stage3U persistent LAB installation — ONLY after explicit operator consent.
# Requires the already-passing reversible rehearsal from commit 65f9b673...
# Installs the exact immutable candidate 54 in isolated Docker, then runs
# previously verified role/rollback fixture 55. No production connection.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [Parameter(Mandatory=$true)][switch]$ApproveLabSchemaInstall,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $ApproveLabSchemaInstall){throw 'Explicit Stage3U LAB schema-install approval is required'}
if($Container -ne 'supabase_db_FiscoSim-P0-LAB-20261008-164658' -or
 !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3U persistent install refused: wrong isolated lab identity'
}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3U persistent install refused: pinned commit mismatch'
}
# Explicitly anchor SQL to the previously tested rehearsal SHA, preventing
# a later unrelated code/document commit from silently changing a migration.
$expectedBlobs=@{
 '54_stage3u_general_journal_atomic_LAB_ONLY.sql'='93a3f66503d4680b4c72007d20fe49dcab63370c'
 '55_stage3u_general_journal_matrix_TEST_ONLY.sql'='a2302c91f170dd377cc03379793959010c80bd4b'
}
foreach($name in $expectedBlobs.Keys){
 $relative='sql/security_p0/'+$name
 $actual=(& git -C $repo hash-object -- $relative)
 if($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $expectedBlobs[$name]){
  throw ('Stage3U unreviewed SQL content detected: '+$name)
 }
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3U isolated Docker LAB container is not running'
}
# Require the prior REAL PostgreSQL rehearsal PASS on the same container/SQL.
# Do NOT accept old blocked preflights or Node-only CI as proof.
$proofs=@(Get-ChildItem -LiteralPath $Lab -Filter 'STAGE3U_REHEARSAL_*.txt' -File)
$verified=$false
foreach($proof in $proofs){
 $c=Get-Content -LiteralPath $proof.FullName -Raw
 if($c.Contains('COMMIT=65f9b6738a2e0be8ac4d677289f3544a3bb10805') -and
    $c.Contains('LAB_ONLY='+$Container) -and
    $c.Contains('STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK') -and
    $c.Contains('STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED') -and
    $c.Contains('STAGE3U_REHEARSAL_EXECUTED')){
  $verified=$true
  break
 }
}
if(-not $verified){throw 'Stage3U verified local reversible rehearsal proof is missing'}
$report=Join-Path $Lab ('STAGE3U_PERSISTENT_LAB_INSTALL_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3U installation report collision'}
$pre=@'
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_general_journal_claim') IS NULL
 AND to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NULL
 AND (SELECT count(*) FROM public.prima_nota)=0
 AND (SELECT count(*) FROM public.prima_nota_righe)=0
 AND (SELECT count(*) FROM public.audit_contabile)=0
 AND (SELECT count(*) FROM public.piano_conti)=0
 THEN '3U_INSTALL_BASELINE|EMPTY|NO_EXISTING_RPC'
 ELSE '3U_INSTALL_BASELINE|UNEXPECTED' END AS result;
ROLLBACK;
'@
$migFile=Join-Path $repo 'sql\security_p0\54_stage3u_general_journal_atomic_LAB_ONLY.sql'
$testFile=Join-Path $repo 'sql\security_p0\55_stage3u_general_journal_matrix_TEST_ONLY.sql'
$migration=Get-Content -LiteralPath $migFile -Raw -Encoding UTF8
$matrix=Get-Content -LiteralPath $testFile -Raw -Encoding UTF8
$log=New-Object System.Collections.Generic.List[string]
$log.Add('COMMIT='+$sha.Trim())
$log.Add('LAB_ONLY='+$Container)
$log.Add('PERSISTENT_SCHEMA=true')
$log.Add('FIXTURE_ROWS_ROLLBACK=true')
$log.Add('REAL_JWT_E2E=false')
$log.Add('WARNING=If SQL 55 fails, SQL 54 may already be installed. DO NOT rerun automatically.')
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
 if($exitCode -ne 0){throw ('Stage3U SQL failed in '+$Name)}
 foreach($expected in $Required){
  if(-not ($result -contains $expected)){throw ('Stage3U missing '+$expected+' in '+$Name)}
 }
 return $null
}
try{
 Invoke-LabSql 'preflight READ ONLY' $pre @('3U_INSTALL_BASELINE|EMPTY|NO_EXISTING_RPC','ROLLBACK')
 Invoke-LabSql 'migration 54 (PERSISTENT DDL)' (
  "SET fiscosim.p0_stage3u_approval='local-general-journal-atomic-candidate-only';`n"+
  $migration
 ) @('COMMIT')
 Invoke-LabSql 'matrix 55 (fixture ROLLBACK)' (
  "SET fiscosim.p0_stage3u_test_approval='local-general-journal-matrix-rollback-only';`n"+
  $matrix
 ) @('STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK','ROLLBACK')
 $post=@'
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_general_journal_claim') IS NOT NULL
 AND to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
 AND (SELECT count(*) FROM public.fiscosim_general_journal_claim)=0
 AND (SELECT count(*) FROM public.prima_nota)=0
 AND (SELECT count(*) FROM public.prima_nota_righe)=0
 AND (SELECT count(*) FROM public.audit_contabile)=0
 AND (SELECT count(*) FROM public.piano_conti)=0
 AND (SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE oid='public.fiscosim_general_journal_claim'::regclass)
 AND NOT has_function_privilege('anon',
     'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated',
     'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
 AND has_function_privilege('service_role',
     'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
 THEN '3U_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS'
 ELSE '3U_PERSISTENT_INSTALL|POSTCHECK_FAILED' END AS result;
ROLLBACK;
'@
 Invoke-LabSql 'postflight READ ONLY' $post @('3U_PERSISTENT_INSTALL|SCHEMA_PRESENT|NO_FIXTURE_ROWS|ACL_PASS','ROLLBACK')
 @('STAGE3U_PERSISTENT_LAB_INSTALL_PASS')+$log.ToArray() |
   Out-File -LiteralPath $report -Encoding UTF8
 Write-Host 'STAGE3U PERSISTENT LAB SCHEMA INSTALL PASS; FIXTURE ROWS ROLLED BACK' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 Write-Host 'Signed JWT/API UI and fiscal accounting cycle remain NOT TESTED'
}catch{
 (@('STAGE3U_PERSISTENT_LAB_INSTALL_BLOCKED',('ERROR='+$_.Exception.Message))+
  $log.ToArray()) | Out-File -LiteralPath $report -Encoding UTF8
 Write-Host ('BLOCKED; do NOT rerun. Report: '+$report) -ForegroundColor Yellow
 throw
}
