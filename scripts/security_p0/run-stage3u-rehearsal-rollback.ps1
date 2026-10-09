# Stage3U: reversible PostgreSQL general journal rehearsal.
# Single top-level transaction: migration + A/B matrix + forced late failure.
# Always ROLLBACK; neither RPC nor synthetic postings remain installed.
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
 throw 'Stage3U: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3U: pinned commit mismatch. No SQL executed.'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3U: isolated PostgreSQL LAB container not running'
}
function Unwrap-PinnedSql {
 param([string]$File,[string]$FinalTerminator)
 $path=Join-Path $repo ('sql\security_p0\'+$File)
 if(!(Test-Path -LiteralPath $path -PathType Leaf)){
  throw ('Stage3U: missing SQL '+$File)
 }
 $source=Get-Content -LiteralPath $path -Raw -Encoding UTF8
 # Exactly ONE top-level transaction wrapper in each pinned migration/fixture.
 $begins=[regex]::Matches($source,'(?m)^BEGIN;\r?\n')
 $ends=[regex]::Matches($source,('(?m)^'+$FinalTerminator+';\s*$'))
 if($begins.Count -ne 1 -or $ends.Count -ne 1){
  throw ('Stage3U: unexpected SQL wrapper in '+$File)
 }
 $withoutStart=[regex]::Replace($source,'(?m)^BEGIN;\r?\n','')
 $endOffset=$withoutStart.LastIndexOf($FinalTerminator+';')
 if($endOffset -lt 0){throw ('Stage3U: missing SQL tail '+$FinalTerminator)}
 $withoutEnd=$withoutStart.Substring(0,$endOffset)
 return $withoutEnd
}
$migration=Unwrap-PinnedSql '54_stage3u_general_journal_atomic_LAB_ONLY.sql' 'COMMIT'
$matrix=Unwrap-PinnedSql '55_stage3u_general_journal_matrix_TEST_ONLY.sql' 'ROLLBACK'
$report=Join-Path $Lab ('STAGE3U_REHEARSAL_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3U: report collision'}
$payload=@"
SET fiscosim.p0_stage3u_approval = 'local-general-journal-atomic-candidate-only';
SET fiscosim.p0_stage3u_test_approval = 'local-general-journal-matrix-rollback-only';
BEGIN;
-- Stage3U candidate migration, WITHOUT standalone COMMIT.
$migration

-- Stage3U real PostgreSQL fixture matrix, WITHOUT standalone BEGIN/ROLLBACK.
$matrix

SELECT 'STAGE3U_REHEARSAL_EXECUTED' AS result;
ROLLBACK;
BEGIN READ ONLY;
SELECT CASE WHEN
 to_regclass('public.fiscosim_general_journal_claim') IS NULL
 AND to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NULL
 AND (SELECT count(*) FROM public.prima_nota)=0
 AND (SELECT count(*) FROM public.prima_nota_righe)=0
 AND (SELECT count(*) FROM public.audit_contabile)=0
 AND (SELECT count(*) FROM public.piano_conti)=0
 THEN 'STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED'
 ELSE 'STAGE3U_ROLLBACK_FAILED' END AS result;
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
$lines=@(
 'STAGE3U_POSTGRESQL_REHEARSAL',
 ('COMMIT='+$sha.Trim()),
 ('LAB_ONLY='+$Container),
 'SINGLE_TRANSACTION_ROLLBACK=true',
 'WARNING=PostgreSQL sequence nextval may advance despite ROLLBACK; no business rows persist',
 'NO_REAL_JWT_OR_UI_TEST=true'
)+@($log | ForEach-Object {[string]$_})
$lines | Out-File -LiteralPath $report -Encoding UTF8
$required=@(
 'STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK',
 'STAGE3U_REHEARSAL_EXECUTED',
 'STAGE3U_ROLLBACK_VERIFIED|NO_SCHEMA_OR_ACCOUNTING_ROWS_PERSISTED'
)
$ok=($exitCode -eq 0)
foreach($marker in $required){
 if(-not ($log -contains $marker)){$ok=$false}
}
if(($log | Where-Object {[string]$_ -match '(?i)(ERROR:|FATAL:|SECURITY FAILURE:)' }).Count -gt 0){
 $ok=$false
}
if(-not $ok){
 Write-Host 'STAGE3U REHEARSAL BLOCKED: actual PostgreSQL errors' -ForegroundColor Yellow
 $diagnostics=@($log | ForEach-Object {[string]$_} |
   Where-Object { $_ -match '(?i)(ERROR:|FATAL:|DETAIL:|HINT:|CONTEXT:)' })
 foreach($entry in $diagnostics){Write-Host $entry -ForegroundColor Yellow}
 Write-Host ('Preserved report: '+$report)
 throw ('Stage3U PostgreSQL rehearsal failed; DO NOT rerun. See '+$report)
}
Write-Host 'STAGE3U POSTGRESQL REHEARSAL PASS; ALL SQL AND FIXTURES ROLLED BACK' -ForegroundColor Green
Write-Host ('Report: '+$report)
Write-Host 'No schema or accounting rows installed. JWT / UI / fiscal cycle still not tested.'
Write-Host 'NOTICE: PostgreSQL sequence counters may advance despite transaction ROLLBACK.' -ForegroundColor Yellow
