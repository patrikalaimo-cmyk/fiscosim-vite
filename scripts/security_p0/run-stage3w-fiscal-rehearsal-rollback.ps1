# Stage3W: reversible fiscal journal rehearsal (install+matrix in ONE txn, ROLLBACK).
# Does NOT persist Stage3W schema. Does NOT modify Stage3U. Windows LAB only.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if($Container -ne $expectedContainer -or
  !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W: pinned commit mismatch. No SQL executed.'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W: isolated PostgreSQL LAB container not running'
}
function Unwrap-PinnedSql {
 param([string]$File,[string]$FinalTerminator)
 $path=Join-Path $repo ('sql\security_p0\'+$File)
 if(!(Test-Path -LiteralPath $path -PathType Leaf)){
  throw ('Stage3W: missing SQL '+$File)
 }
 $source=Get-Content -LiteralPath $path -Raw -Encoding UTF8
 $begins=[regex]::Matches($source,'(?m)^BEGIN;\r?\n')
 $ends=[regex]::Matches($source,('(?m)^'+$FinalTerminator+';\s*$'))
 if($begins.Count -ne 1 -or $ends.Count -ne 1){
  throw ('Stage3W: unexpected SQL wrapper in '+$File)
 }
 $withoutStart=[regex]::Replace($source,'(?m)^BEGIN;\r?\n','')
 $endOffset=$withoutStart.LastIndexOf($FinalTerminator+';')
 if($endOffset -lt 0){throw ('Stage3W: missing SQL tail '+$FinalTerminator)}
 return $withoutStart.Substring(0,$endOffset)
}
$migration=Unwrap-PinnedSql '57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql' 'COMMIT'
$matrix=Unwrap-PinnedSql '58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql' 'ROLLBACK'
$report=Join-Path $Lab ('STAGE3W_FISCAL_REHEARSAL_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3W: report collision'}
$payload=@"
SET fiscosim.p0_stage3w_approval = 'local-fiscal-journal-atomic-candidate-only';
SET fiscosim.p0_stage3w_test_approval = 'local-fiscal-journal-matrix-rollback-only';
BEGIN;
$migration
$matrix
SELECT 'STAGE3W_REHEARSAL_EXECUTED' AS result;
ROLLBACK;
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_fiscal_journal_claim') IS NULL
 AND to_regprocedure(
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
 ) IS NULL
 THEN 'STAGE3W_ROLLBACK_VERIFIED|NO_FISCAL_SCHEMA_PERSISTED'
 ELSE 'STAGE3W_ROLLBACK_FAILED' END AS result;
ROLLBACK;
"@
$log=@()
$exitCode=1
$oldPreference=$ErrorActionPreference
try{
 $ErrorActionPreference='Continue'
 $log=@($payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
  -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
 $exitCode=$LASTEXITCODE
}finally{
 $ErrorActionPreference=$oldPreference
}
function Test-LogHas([object[]]$Log,[string]$Needle){
 return [bool](@($Log | ForEach-Object {[string]$_}) | Where-Object { $_ -like ('*'+$Needle+'*') })
}
$logLines=@(
 'STAGE3W_FISCAL_REHEARSAL',
 "COMMIT=$($sha.Trim())",
 "LAB_ONLY=$Container",
 'SINGLE_TRANSACTION_ROLLBACK=true',
 'NO_REAL_JWT_OR_UI_TEST=true',
 'STAGE3U_RPC_NOT_MODIFIED=true'
) + @($log | ForEach-Object {[string]$_})
$logLines | Out-File -LiteralPath $report -Encoding UTF8
if($exitCode -ne 0 -or -not (Test-LogHas $log 'STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK') -or
 -not (Test-LogHas $log 'STAGE3W_ROLLBACK_VERIFIED|NO_FISCAL_SCHEMA_PERSISTED')){
 Write-Host 'STAGE3W REHEARSAL BLOCKED' -ForegroundColor Yellow
 Write-Host 'PostgreSQL diagnostics:' -ForegroundColor Yellow
 @($log | ForEach-Object {[string]$_} |
  Where-Object { $_ -match '(?i)(ERROR:|FATAL:|DETAIL:|HINT:|Stage3W|SECURITY FAILURE|ROLLBACK_FAILED)' }) |
  ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
 Write-Host ('Preserved report: '+$report)
 throw ('Stage3W rehearsal BLOCKED; see report: '+$report)
}
Write-Host 'STAGE3W FISCAL REHEARSAL ROLLBACK PASS' -ForegroundColor Green
Write-Host ('Report: '+$report)
Write-Host 'No persistent Stage3W schema; Stage3U untouched; no LIVE writes.'
