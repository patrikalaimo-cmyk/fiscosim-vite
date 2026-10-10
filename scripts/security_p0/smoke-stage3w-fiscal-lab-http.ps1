# Stage3W: smoke that LAB fiscal HTTP facade is enabled (expect 401/403/400).
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Api='http://127.0.0.1:3001',
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or -not $sha -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W smoke: pinned commit mismatch'
}
$sha=$sha.Trim()
if(!(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W smoke: LAB folder missing'
}
$envFile=Join-Path $repo '.env.stage3w.lab.local'
if(!(Test-Path -LiteralPath $envFile -PathType Leaf)){
 throw 'Stage3W smoke: missing .env.stage3w.lab.local - run start-stage3w-lab-ui-stack.ps1 first'
}

$uri=$Api.TrimEnd('/')+'/api/studio/fiscal-journal-post'
$code=0
$body=''
try{
 $resp=Invoke-WebRequest -Uri $uri -Method POST -ContentType 'application/json' `
  -Body '{"probe":true}' -UseBasicParsing -TimeoutSec 8
 $code=[int]$resp.StatusCode
 $body=[string]$resp.Content
}catch{
 $ex=$_.Exception
 if($ex.Response){
  $code=[int]$ex.Response.StatusCode.value__
  if(-not $code){ try{ $code=[int]$ex.Response.StatusCode }catch{ $code=0 } }
  try{
   $reader=New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
   $body=$reader.ReadToEnd()
  }catch{ $body=[string]$ex.Message }
 }else{
  throw ('Stage3W smoke: API unreachable at '+$uri+' - wait for the dev-api window, then retry')
 }
}
$report=Join-Path $Lab ('STAGE3W_LAB_HTTP_SMOKE_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
@(
 'STAGE3W_LAB_HTTP_SMOKE',
 ('COMMIT='+$sha),
 ('URL='+$uri),
 ('HTTP='+$code),
 ('BODY='+$body)
) | Set-Content -LiteralPath $report -Encoding UTF8

if($code -eq 503 -or $body -match 'FISCAL_JOURNAL_LAB_ONLY_DISABLED' -or $body -match 'loopback-only Auth laboratory'){
 Write-Host 'STAGE3W LAB HTTP SMOKE BLOCKED: fiscal endpoint still LAB-disabled' -ForegroundColor Yellow
 Write-Host ('Report: '+$report)
 throw 'Stage3W smoke BLOCKED: restart start-stage3w-lab-ui-stack.ps1 so dev-api loads .env.stage3w.lab.local'
}
if($code -eq 404){
 throw 'Stage3W smoke BLOCKED: route missing (wrong server on :3001?)'
}
if($code -eq 405){
 throw ('Stage3W smoke BLOCKED: HTTP 405 on :3001 - stale/wrong process. Re-run start script. Report: '+$report)
}
if($code -eq 401 -or $code -eq 403 -or $code -eq 400){
 Write-Host 'STAGE3W LAB HTTP SMOKE PASS (endpoint enabled)' -ForegroundColor Green
 Write-Host ('Report: '+$report)
 Write-Host 'Open http://127.0.0.1:5173 - login - save one fattura attiva.'
 return
}
Write-Host ('Unexpected HTTP '+$code) -ForegroundColor Yellow
Write-Host ('Report: '+$report)
throw ('Stage3W smoke unexpected HTTP '+$code)
