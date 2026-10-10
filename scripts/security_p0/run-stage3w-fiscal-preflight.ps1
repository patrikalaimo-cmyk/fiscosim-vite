# Stage3W fiscal atomic commit: READ-ONLY preflight. No DDL/DML/posting.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W preflight: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W preflight: pinned commit mismatch (no SQL executed)'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W preflight: isolated Docker LAB container not running'
}
$path=Join-Path $repo 'sql\security_p0\59_stage3w_fiscal_preflight_READ_ONLY.sql'
if(!(Test-Path -LiteralPath $path -PathType Leaf)){
 throw 'Stage3W preflight SQL file missing'
}
function Test-LogHas([object[]]$Log,[string]$Needle){
 return [bool](@($Log | ForEach-Object {[string]$_}) | Where-Object { $_ -like ('*'+$Needle+'*') })
}
$report=Join-Path $Lab ('STAGE3W_FISCAL_PREFLIGHT_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3W report collision'}
$payload="SET fiscosim.p0_stage3w_readonly_preflight='local-fiscal-journal-readonly-preflight';`n"+
 (Get-Content -LiteralPath $path -Raw -Encoding UTF8)
$log=@()
$code=1
$old=$ErrorActionPreference
try{
 $ErrorActionPreference='Continue'
 $log=@($payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
   -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
 $code=$LASTEXITCODE
}finally{
 $ErrorActionPreference=$old
}
$logLines=@(
 'STAGE3W_FISCAL_PREFLIGHT',
 "COMMIT=$($sha.Trim())",
 "LAB_ONLY=$Container",
 'READ_ONLY=true',
 'POSTGRESQL_EXECUTED_IN_CLOUD=false'
) + @($log | ForEach-Object {[string]$_})
$logLines | Out-File -LiteralPath $report -Encoding UTF8
if($code -ne 0 -or -not (Test-LogHas $log 'STAGE3W_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST') -or
 -not (Test-LogHas $log 'ROLLBACK')){
 Write-Host 'STAGE3W PREFLIGHT BLOCKED' -ForegroundColor Yellow
 Write-Host 'PostgreSQL diagnostics:' -ForegroundColor Yellow
 @($log | ForEach-Object {[string]$_} |
  Where-Object { $_ -match '(?i)(ERROR:|FATAL:|DETAIL:|HINT:|Stage3W|MISSING|incomplete)' }) |
  ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
 Write-Host ('Preserved report: '+$report)
 throw ('Stage3W preflight BLOCKED; see report: '+$report)
}
Write-Host 'STAGE3W FISCAL PREFLIGHT READ-ONLY PASS' -ForegroundColor Green
Write-Host ('Report: '+$report)
Write-Host 'No fiscal journal posted, no schema installed, no LIVE Supabase connection.'
