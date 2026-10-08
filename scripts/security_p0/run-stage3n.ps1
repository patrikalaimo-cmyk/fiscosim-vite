# FiscoSim P0 Stage3N -- only the isolated Windows Docker LAB.
# Requires a detached checkout of an explicit, verified Git commit.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedCommit,
  [string]$Lab = 'C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
  [string]$Container = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$report=Join-Path $Lab 'STAGE3N_RESULT.txt'
$lines=New-Object System.Collections.Generic.List[string]
if (!(Test-Path -LiteralPath $Lab -PathType Container)) {
  throw 'Stage3N: dedicated lab missing'
}
if ($Container -ne 'supabase_db_FiscoSim-P0-LAB-20261008-164658') {
  throw 'Stage3N: refusing unexpected container'
}
$actual=(& git -C $repo rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or
    [string]::IsNullOrWhiteSpace($actual) -or
    $actual.Trim() -ne $ExpectedCommit) {
  throw 'Stage3N: git checkout is not the pinned commit'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if ($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true') {
  throw 'Stage3N: Docker P0 container not running'
}

function Invoke-P0Sql {
  param([string]$Name,[string]$ApprovalSetting='', [string]$Approval='')
  $path=Join-Path $repo ('sql\security_p0\' + $Name)
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw ('Stage3N: missing script ' + $Name)
  }
  $prefix="SET client_min_messages TO warning;`n"
  if ($ApprovalSetting) {
    $prefix+="SET $ApprovalSetting = '$Approval';`n"
  }
  $payload=$prefix + (Get-Content -LiteralPath $path -Encoding UTF8 -Raw)
  $output=@(
    $payload | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
      -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1
  )
  $code=$LASTEXITCODE
  $script:lines.Add('=== ' + $Name + ' ===')
  foreach ($item in $output) { $script:lines.Add([string]$item) }
  if ($code -ne 0) {
    $output | Select-Object -Last 15 | Out-Host
    throw ('Stage3N: PostgreSQL FAIL for ' + $Name)
  }
  return $output
}

try {
  Write-Host 'Stage3N: staff ACL patch in isolated LAB...' -ForegroundColor Cyan
  $apply=@(Invoke-P0Sql -Name '38_stage3n_staff_write_acl_LAB_ONLY.sql' `
    -ApprovalSetting 'fiscosim.p0_stage3n_approval' `
    -Approval 'local-server-only-staff-writes')
  if (-not ($apply -contains 'COMMIT')) {
    throw 'Stage3N: missing patch COMMIT'
  }
  Write-Host 'Stage3N: negative authenticated SQL test...' -ForegroundColor Cyan
  $test=@(Invoke-P0Sql -Name '39_stage3n_staff_write_acl_TEST_ONLY.sql' `
    -ApprovalSetting 'fiscosim.p0_stage3n_test_approval' `
    -Approval 'local-staff-browser-dml-negative-qa')
  if (-not ($test -contains 'ROLLBACK')) {
    throw 'Stage3N: missing test ROLLBACK'
  }
  $risk=@(Invoke-P0Sql -Name '23_stage3f_role_only_READ_ONLY.sql')
  foreach ($item in @(
    'RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH|0',
    'RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK|0',
    'RISK_ROLE_ONLY_AUTHENTICATED_TABLES|1',
    'RISK_TRUE_POLICY_AUTH_TABLES|1',
    'RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS|3'
  )) {
    if (-not ($risk -contains $item)) {
      throw ('Stage3N: expected residual audit mismatch: ' + $item)
    }
  }
  @('STAGE3N LAB SQL PASS',('COMMIT=' + $ExpectedCommit)) +
    $lines.ToArray() | Out-File -LiteralPath $report -Encoding UTF8
  Write-Host 'STAGE3N LAB SQL PASS' -ForegroundColor Green
  Write-Host ('Report: ' + $report)
  $risk | Where-Object { $_ -match '^RISK_' } | Out-Host
} catch {
  @('STAGE3N FAILED',('COMMIT=' + $ExpectedCommit)) +
    $lines.ToArray() | Out-File -LiteralPath $report -Encoding UTF8
  throw
}
