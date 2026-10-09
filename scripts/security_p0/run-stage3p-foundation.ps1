# FiscoSim P0 Stage3P foundational link — isolated Docker LAB ONLY.
# Creates only sealed empty CRM/company link, then runs negative real SQL tests.
# Existing clienti / AgeCon / revisioni policies remain UNTOUCHED.
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
  throw 'Stage3P: unexpected LAB path or Docker name'
}
$actual=(& git -C $repo rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $ExpectedCommit) {
  throw 'Stage3P: pinned repository SHA mismatch; no SQL executed'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if ($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true') {
  throw 'Stage3P: isolated Docker container not running'
}
$report=Join-Path $Lab 'STAGE3P_FOUNDATION_RESULT.txt'
if (Test-Path -LiteralPath $report) {
  $report=Join-Path $Lab ('STAGE3P_FOUNDATION_RESULT_' +
    (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '.txt')
  if (Test-Path -LiteralPath $report) {
    throw 'Stage3P: evidence file collision; preserving prior report'
  }
}
$lines=New-Object System.Collections.Generic.List[string]

function Invoke-Stage3PSql {
  param([string]$Name,[string]$Setting,[string]$Approval)
  $path=Join-Path $repo ('sql\security_p0\' + $Name)
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw ('Stage3P: SQL missing: ' + $Name)
  }
  $prefix="SET client_min_messages TO warning;`n"
  if ($Setting) {
    $prefix+="SET $Setting = '$Approval';`n"
  }
  $payload=$prefix+(Get-Content -LiteralPath $path -Raw -Encoding UTF8)
  $output=@(
    $payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
      -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1
  )
  $exit=$LASTEXITCODE
  $script:lines.Add('=== '+$Name+' ===')
  foreach ($l in $output) {$script:lines.Add([string]$l)}
  if ($exit -ne 0) {
    $output | Select-Object -Last 18 | Out-Host
    throw ('Stage3P: PostgreSQL FAIL in '+$Name)
  }
  return $output
}

try {
  Write-Host 'Stage3P: create empty sealed CRM/company link (LAB only)' -ForegroundColor Cyan
  $apply=@(Invoke-Stage3PSql -Name '42_stage3p_empty_crm_link_LAB_ONLY.sql' `
    -Setting 'fiscosim.p0_stage3p_approval' `
    -Approval 'local-empty-crm-company-link-foundation')
  if (-not ($apply -contains 'COMMIT')) {
    throw 'Stage3P: missing foundation COMMIT'
  }

  Write-Host 'Stage3P: negative anon/authenticated/service SQL checks' -ForegroundColor Cyan
  $negative=@(Invoke-Stage3PSql -Name '43_stage3p_empty_crm_link_TEST_ONLY.sql' `
    -Setting 'fiscosim.p0_stage3p_test_approval' `
    -Approval 'local-crm-link-role-qa-only')
  if (-not ($negative -contains 'ROLLBACK')) {
    throw 'Stage3P: missing negative-test ROLLBACK'
  }

  Write-Host 'Stage3P: real fixture A/B inside an aborted transaction' -ForegroundColor Cyan
  $real=@(Invoke-Stage3PSql -Name '44_stage3p_crm_link_real_transaction_TEST_ONLY.sql' `
    -Setting 'fiscosim.p0_stage3p_fixture_approval' `
    -Approval 'isolated-transactional-crm-link-fixtures-only')
  if (-not ($real -contains 'ROLLBACK')) {
    throw 'Stage3P: missing transaction-fixture ROLLBACK'
  }
  $verifySql=@'
BEGIN READ ONLY;
SELECT '3P_VERIFY|'||
  (SELECT count(*) FROM public.crm_cliente_societa_link)::text||'|'||
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename='crm_cliente_societa_link')::text||'|'||
  (SELECT relrowsecurity::text FROM pg_class
    WHERE oid='public.crm_cliente_societa_link'::regclass);
ROLLBACK;
'@
  $check=@($verifySql | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
    -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1)
  $checkExit=$LASTEXITCODE
  $lines.Add('=== Stage3P final READ ONLY check ===')
  foreach ($l in $check){$lines.Add([string]$l)}
  if ($checkExit -ne 0 -or -not ($check -contains '3P_VERIFY|0|0|true') -or
      -not ($check -contains 'ROLLBACK')) {
    throw 'Stage3P: final sealed/empty state not verified'
  }
  @('STAGE3P LAB FOUNDATION PASS',('COMMIT='+$ExpectedCommit)) +
    $lines.ToArray() | Out-File -LiteralPath $report -Encoding UTF8
  Write-Host 'STAGE3P LAB FOUNDATION PASS' -ForegroundColor Green
  Write-Host ('Report: '+$report)
  Write-Host 'No customer associations or existing fiscal policies changed'
} catch {
  @('STAGE3P LAB FOUNDATION FAILED',('COMMIT='+$ExpectedCommit)) +
    $lines.ToArray() | Out-File -LiteralPath $report -Encoding UTF8
  throw
}
