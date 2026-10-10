# FiscoSim Stage 3M -- PowerShell 5.1 compatible, local Docker LAB only.
# Run only from the verified exact git commit, with -ExpectedCommit.
# NOT for production; deliberate browser-access quarantine on six tables.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedCommit,
  [string]$Lab = 'C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
  [string]$Container = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$report = Join-Path $Lab 'STAGE3M_RESULT.txt'
$logLines = New-Object System.Collections.Generic.List[string]

if (!(Test-Path -LiteralPath $Lab -PathType Container)) {
  throw 'Stage3M: expected isolated Docker LAB directory not found'
}
$head = (& git -C $repo rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($head) -or
    $head.Trim() -ne $ExpectedCommit) {
  throw 'Stage3M: repository HEAD does not match explicitly pinned commit'
}
$running = (& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if ($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true') {
  throw 'Stage3M: expected P0 Docker container not running'
}
if ($Container -ne 'supabase_db_FiscoSim-P0-LAB-20261008-164658') {
  throw 'Stage3M: unexpected Docker container name'
}

function Invoke-P0Sql {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$ApprovalSetting = '',
    [string]$ApprovalValue = ''
  )
  $path = Join-Path $repo ("sql\security_p0\" + $Name)
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw ('Stage3M: missing SQL file ' + $Name)
  }
  $header = "SET client_min_messages TO warning;`n"
  if ($ApprovalSetting) {
    $header += "SET $ApprovalSetting = '$ApprovalValue';`n"
  }
  $sql = $header + (Get-Content -LiteralPath $path -Raw -Encoding UTF8)
  $result = @(
    $sql | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 `
      -U postgres -d postgres -A -t -F '|' -P pager=off 2>&1
  )
  $code = $LASTEXITCODE
  $script:logLines.Add("=== $Name ===")
  foreach ($line in $result) { $script:logLines.Add([string]$line) }
  if ($code -ne 0) {
    $result | Select-Object -Last 20 | Out-Host
    throw ('Stage3M: PostgreSQL FAIL on ' + $Name)
  }
  return $result
}

try {
  Write-Host 'Stage3M: applying guarded LAB-only browser containment' -ForegroundColor Cyan
  $apply = @(Invoke-P0Sql -Name '35_stage3m_six_browser_quarantine_LAB_ONLY.sql' `
    -ApprovalSetting 'fiscosim.p0_stage3m_approval' `
    -ApprovalValue 'isolated-six-table-browser-quarantine-only')
  if (-not ($apply -contains 'COMMIT')) {
    throw 'Stage3M: SQL apply missing COMMIT'
  }

  Write-Host 'Stage3M: negative SQL-role tests, with mandatory ROLLBACK' -ForegroundColor Cyan
  $test = @(Invoke-P0Sql -Name '36_stage3m_six_browser_quarantine_TEST_ONLY.sql' `
    -ApprovalSetting 'fiscosim.p0_stage3m_test_approval' `
    -ApprovalValue 'local-six-browser-negative-test-only')
  if (-not ($test -contains 'ROLLBACK')) {
    throw 'Stage3M: SQL test missing ROLLBACK'
  }

  $risks = @(Invoke-P0Sql -Name '23_stage3f_role_only_READ_ONLY.sql')
  foreach ($expected in @(
    'RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH|0',
    'RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK|0',
    'RISK_ROLE_ONLY_AUTHENTICATED_TABLES|1',
    'RISK_TRUE_POLICY_AUTH_TABLES|1',
    'RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS|3'
  )) {
    if (-not ($risks -contains $expected)) {
      throw ('Stage3M: unexpected residual metric: ' + $expected)
    }
  }
  @('STAGE3M LAB SQL PASS', 'COMMIT=' + $ExpectedCommit) +
    @($logLines.ToArray()) | Out-File -LiteralPath $report -Encoding UTF8
  Write-Host 'STAGE3M LAB SQL PASS' -ForegroundColor Green
  Write-Host ('Report: ' + $report)
  $risks | Where-Object { $_ -match '^RISK_' } | Out-Host
} catch {
  @('STAGE3M FAILED', 'COMMIT=' + $ExpectedCommit) +
    @($logLines.ToArray()) | Out-File -LiteralPath $report -Encoding UTF8
  throw
}
