# P0 Stage3P: ONLY READ-ONLY local PostgreSQL metadata/aggregate audit.
# Must execute from a detached checkout at -ExpectedCommit.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ($Container -ne 'supabase_db_FiscoSim-P0-LAB-20261008-164658' -or
  !(Test-Path -LiteralPath $Lab -PathType Container)) {
 throw 'Stage3P: isolated Docker LAB mismatch'
}
$actual=(& git -C $repo rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $ExpectedCommit) {
 throw 'Stage3P: checkout SHA mismatch; no SQL executed'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if ($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true') {
 throw 'Stage3P: Docker container inactive'
}
$scriptPath=Join-Path $repo 'sql\security_p0\41_stage3p_ownership_preflight_READ_ONLY.sql'
if (!(Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
 throw 'Stage3P: required SQL unavailable'
}
$sql="BEGIN READ ONLY;`n" + (Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8) + "`nROLLBACK;`n"
$out=@(
 $sql | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
   -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1
)
$exitCode=$LASTEXITCODE
if ($exitCode -ne 0) {
 $out | Select-Object -Last 20 | Out-Host
 throw 'Stage3P: SQL failed; no changes made'
}
$result=$out -join "`n"
foreach ($marker in @('3P_TABLE','3P_COLUMN','3P_CONSTRAINT','3P_POLICY','3P_FUNCTION','3P_COUNT')) {
 if ($result -notmatch ('(?m)^' + $marker + '\|')) {
  throw ('Stage3P: missing report section ' + $marker)
 }
}
if ($result -notmatch '(?m)^ROLLBACK\s*$') {
 throw 'Stage3P: no read-only transaction rollback evidence'
}
$base=Join-Path $Lab 'STAGE3P_OWNERSHIP_PREFLIGHT.txt'
if (Test-Path -LiteralPath $base) {
 $base=Join-Path $Lab ('STAGE3P_OWNERSHIP_PREFLIGHT_' +
  (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '.txt')
 if (Test-Path -LiteralPath $base) {
  throw 'Stage3P: audit report filename collision'
 }
}
@('STAGE3P READ-ONLY PASS',('COMMIT='+$ExpectedCommit))+$out |
 Out-File -LiteralPath $base -Encoding UTF8
Write-Host 'STAGE3P READ-ONLY PASS' -ForegroundColor Green
Write-Host ('Lines: '+$out.Count)
Write-Host ('Report: '+$base)
Write-Host 'No database modifications'
