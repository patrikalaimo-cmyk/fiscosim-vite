# Stage3U / inventory only: READ-ONLY, no SQL migration or accounting write.
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
 throw 'Stage3U preflight: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3U preflight: pinned commit mismatch (no SQL executed)'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3U preflight: isolated Docker LAB container not running'
}
$path=Join-Path $repo 'sql\security_p0\56_stage3u_accounting_preflight_READ_ONLY.sql'
if(!(Test-Path -LiteralPath $path -PathType Leaf)){
 throw 'Stage3U preflight SQL file missing'
}
$report=Join-Path $Lab ('STAGE3U_ACCOUNTING_PREFLIGHT_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
if(Test-Path -LiteralPath $report){throw 'Stage3U report collision'}
$payload="SET fiscosim.p0_stage3u_preflight_approval='local-general-journal-readonly-preflight';`n"+
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
 'STAGE3U_ACCOUNTING_PREFLIGHT',
 "COMMIT=$($sha.Trim())",
 "LAB_ONLY=$Container",
 'READ_ONLY=true'
) + @($log | ForEach-Object {[string]$_})
$logLines | Out-File -LiteralPath $report -Encoding UTF8
$lineScopeValid=(($log -contains 'STAGE3U_LINE_TENANT_SCOPE|PARENT_ONLY_COMPANY') -or
 ($log -contains 'STAGE3U_LINE_TENANT_SCOPE|PARENT_AND_LINE_COMPANY'))
if($code -ne 0 -or -not ($log -contains 'STAGE3U_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST') -or
 -not ($log -contains 'ROLLBACK') -or -not $lineScopeValid){
 Write-Host 'STAGE3U PREFLIGHT BLOCKED: PostgreSQL diagnostics (read-only)' -ForegroundColor Yellow
 $diagnosticLines=@($log | ForEach-Object { [string]$_ } |
  Where-Object { $_ -match '(?i)(ERROR:|FATAL:|DETAIL:|HINT:|CONTEXT:|psql:|STAGE3U.*MISSING|Stage3U.*incomplete|Stage3U LAB has existing)' })
 if($diagnosticLines.Count -eq 0){
  Write-Host 'No PostgreSQL error line recognized; inspect full report for preceding messages.' -ForegroundColor Yellow
 }else{
  foreach($entry in $diagnosticLines){Write-Host $entry -ForegroundColor Yellow}
 }
 Write-Host ('Preserved report: '+$report)
 throw ('Stage3U preflight BLOCKED; see report: '+$report)
}
Write-Host 'STAGE3U ACCOUNTING PREFLIGHT READ-ONLY PASS' -ForegroundColor Green
Write-Host ('Report: '+$report)
Write-Host 'No accounting journal posted, no schema installed, no LIVE Supabase connection.'
