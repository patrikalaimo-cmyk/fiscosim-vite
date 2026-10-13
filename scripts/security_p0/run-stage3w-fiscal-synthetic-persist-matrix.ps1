# Stage3W: persistent synthetic matrix (pay/NC/split/parcella/FP22) on SG-E2E LAB.
# Requires SQL 60 FA22 already persisted. Pass -ApproveSyntheticPersistMatrix.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [switch]$ApproveSyntheticPersistMatrix,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if(-not $ApproveSyntheticPersistMatrix){
 throw 'Stage3W synthetic persist matrix blocked: pass -ApproveSyntheticPersistMatrix'
}
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W synthetic persist matrix: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or -not $sha -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W synthetic persist matrix: pinned commit mismatch. No SQL executed.'
}
$sha=$sha.Trim()
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W synthetic persist matrix: LAB PostgreSQL container not running'
}
$sqlPath=Join-Path $repo 'sql\security_p0\61_stage3w_fiscal_synthetic_persist_MATRIX_LAB_ONLY.sql'
if(!(Test-Path -LiteralPath $sqlPath -PathType Leaf)){
 throw 'Stage3W synthetic persist matrix: missing SQL 61'
}
$source=Get-Content -LiteralPath $sqlPath -Raw -Encoding UTF8
$report=Join-Path $Lab ('STAGE3W_SYNTHETIC_PERSIST_MATRIX_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){ throw 'Stage3W synthetic persist matrix: report collision' }

$payload=@"
SET fiscosim.p0_stage3w_persist_matrix_approval = 'local-fiscal-synthetic-persist-matrix-only';
$source
BEGIN READ ONLY;
SELECT 'POST_FA22_RES|'||coalesce(max(importo_residuo)::text,'missing')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-FA22-001';
SELECT 'POST_NC_RES|'||coalesce(max(importo_residuo)::text,'missing')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-NC22-001';
SELECT 'POST_SPLIT_RES|'||coalesce(max(importo_residuo)::text,'missing')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-SPLIT-001';
SELECT 'POST_PARC_RES|'||coalesce(max(importo_residuo)::text,'missing')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-PARC-001';
SELECT 'POST_FP_RES|'||coalesce(max(importo_residuo)::text,'missing')
 FROM public.partitario WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-FP22-001';
SELECT 'POST_RIT|'||count(*)::text FROM public.ritenute_dacconto
 WHERE societa_id='72000000-0000-4000-8000-000000000001' AND numero_documento='SG-E2E-PARC-001';
SELECT 'POST_PN_A|'||count(*)::text FROM public.prima_nota WHERE societa_id='72000000-0000-4000-8000-000000000001';
SELECT 'POST_PN_B|'||count(*)::text FROM public.prima_nota WHERE societa_id='72000000-0000-4000-8000-000000000002';
SELECT 'POST_STAGE3U|'||(to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text;
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
 -and (Test-LogHas $log 'STAGE3W_SYNTHETIC_PERSIST_MATRIX|PASS|COMMIT_READY') `
 -and (Test-LogHas $log 'POST_FA22_RES|720') `
 -and (Test-LogHas $log 'POST_NC_RES|-1220') `
 -and (Test-LogHas $log 'POST_SPLIT_RES|1000') `
 -and (Test-LogHas $log 'POST_PARC_RES|1068.80') `
 -and (Test-LogHas $log 'POST_FP_RES|1220') `
 -and (Test-LogHas $log 'POST_RIT|1') `
 -and (Test-LogHas $log 'POST_PN_B|0') `
 -and (Test-LogHas $log 'POST_STAGE3U|true')

$lines=@(
 'STAGE3W_SYNTHETIC_PERSIST_MATRIX',
 ('COMMIT='+$sha),
 ('LAB_ONLY='+$Container),
 'CASES=pay720,NC,split,parcella,FP22',
 'PREFIX=SG-E2E-',
 'JWT_UI=false',
 'SERVICE_ROLE_RPC=true',
 ('EXIT='+$exitCode),
 ('RESULT='+($(if($pass){'PASS'}else{'BLOCKED'})))
) + @($log | ForEach-Object {[string]$_})
$lines | Set-Content -LiteralPath $report -Encoding UTF8

if($pass){
 Write-Host 'STAGE3W SYNTHETIC PERSIST MATRIX PASS' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 return
}
Write-Host 'STAGE3W SYNTHETIC PERSIST MATRIX BLOCKED' -ForegroundColor Yellow
Write-Host ('Report: '+$report)
@($log | Select-Object -Last 50) | ForEach-Object { Write-Host $_ }
throw 'Stage3W synthetic persist matrix BLOCKED'
