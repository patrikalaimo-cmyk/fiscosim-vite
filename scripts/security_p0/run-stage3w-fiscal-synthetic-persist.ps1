# Stage3W: persistent synthetic FA22 on P0 LAB (service_role RPC, not JWT/UI).
# Requires -ApproveSyntheticPersist. Does not touch LIVE or ordinary stack :54321.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [switch]$ApproveSyntheticPersist,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if(-not $ApproveSyntheticPersist){
 throw 'Stage3W synthetic persist blocked: pass -ApproveSyntheticPersist'
}
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W synthetic persist: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or -not $sha -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W synthetic persist: pinned commit mismatch. No SQL executed.'
}
$sha=$sha.Trim()
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W synthetic persist: LAB PostgreSQL container not running'
}
$sqlPath=Join-Path $repo 'sql\security_p0\60_stage3w_fiscal_synthetic_persist_FA22_LAB_ONLY.sql'
if(!(Test-Path -LiteralPath $sqlPath -PathType Leaf)){
 throw 'Stage3W synthetic persist: missing SQL 60'
}
$source=Get-Content -LiteralPath $sqlPath -Raw -Encoding UTF8
$report=Join-Path $Lab ('STAGE3W_SYNTHETIC_PERSIST_FA22_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){ throw 'Stage3W synthetic persist: report collision' }

$payload=@"
SET fiscosim.p0_stage3w_persist_approval = 'local-fiscal-synthetic-persist-fa22-only';
$source
BEGIN READ ONLY;
SELECT 'POSTCHECK_PN|'||count(*)::text FROM public.prima_nota WHERE societa_id='72000000-0000-4000-8000-000000000001';
SELECT 'POSTCHECK_IVA|'||count(*)::text FROM public.registri_iva WHERE societa_id='72000000-0000-4000-8000-000000000001';
SELECT 'POSTCHECK_PART|'||count(*)::text||'|RES|'||coalesce(max(importo_residuo)::text,'0')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001';
SELECT 'POSTCHECK_CLAIM|'||count(*)::text FROM public.fiscosim_fiscal_journal_claim
 WHERE societa_id='72000000-0000-4000-8000-000000000001';
SELECT 'POSTCHECK_B_PN|'||count(*)::text FROM public.prima_nota WHERE societa_id='72000000-0000-4000-8000-000000000002';
SELECT 'POSTCHECK_STAGE3U|'||(to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text;
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

$pass = ($exitCode -eq 0) `
 -and (Test-LogHas $log 'STAGE3W_SYNTHETIC_PERSIST_FA22|PASS|COMMIT_READY') `
 -and (Test-LogHas $log 'POSTCHECK_PN|1') `
 -and (Test-LogHas $log 'POSTCHECK_IVA|1') `
 -and (Test-LogHas $log 'POSTCHECK_PART|1|RES|1220') `
 -and (Test-LogHas $log 'POSTCHECK_CLAIM|1') `
 -and (Test-LogHas $log 'POSTCHECK_B_PN|0') `
 -and (Test-LogHas $log 'POSTCHECK_STAGE3U|true')

$lines=@(
 'STAGE3W_SYNTHETIC_PERSIST_FA22',
 ('COMMIT='+$sha),
 ('LAB_ONLY='+$Container),
 'CONTRACT=fattura_attiva_FA22',
 'PREFIX=SG-E2E-',
 'JWT_UI=false',
 'SERVICE_ROLE_RPC=true',
 ('EXIT='+$exitCode),
 ('RESULT='+($(if($pass){'PASS'}else{'BLOCKED'})))
) + @($log | ForEach-Object {[string]$_})
$lines | Set-Content -LiteralPath $report -Encoding UTF8

if($pass){
 Write-Host 'STAGE3W SYNTHETIC PERSIST FA22 PASS' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 return
}
Write-Host 'STAGE3W SYNTHETIC PERSIST FA22 BLOCKED' -ForegroundColor Yellow
Write-Host ('Report: '+$report)
@($log | Select-Object -Last 40) | ForEach-Object { Write-Host $_ }
throw 'Stage3W synthetic persist FA22 BLOCKED'
