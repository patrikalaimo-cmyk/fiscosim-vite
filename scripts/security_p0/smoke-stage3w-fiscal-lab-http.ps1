# Stage3W: smoke that LAB fiscal HTTP facade is enabled (expect 401, not 503/404).
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Api='http://127.0.0.1:3001',
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658'
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W smoke: pinned commit mismatch'
}
if(!(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W smoke: LAB folder missing'
}
$uri=$Api.TrimEnd('/')+'/api/studio/fiscal-journal-post'
try{
 $resp=Invoke-WebRequest -Uri $uri -Method POST -ContentType 'application/json' `
  -Body '{}' -UseBasicParsing -TimeoutSec 8
 $code=[int]$resp.StatusCode
 $body=[string]$resp.Content
}catch{
 $ex=$_.Exception
 if($ex.Response){
  $code=[int]$ex.Response.StatusCode
  $reader=New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
  $body=$reader.ReadToEnd()
 }else{
  throw ('Stage3W smoke: API unreachable at '+$uri+' — start start-stage3w-lab-ui-stack.ps1 first')
 }
}
$report=Join-Path $Lab ('STAGE3W_LAB_HTTP_SMOKE_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
@(
 'STAGE3W_LAB_HTTP_SMOKE',
 ('COMMIT='+$sha.Trim()),
 ('URL='+$uri),
 ('HTTP='+$code),
 ('BODY='+$body)
) | Set-Content -LiteralPath $report -Encoding UTF8

# Enabled LAB returns auth failure; disabled returns 503 FISCAL_JOURNAL_LAB_ONLY_DISABLED.
if($code -eq 503 -or $body -match 'FISCAL_JOURNAL_LAB_ONLY_DISABLED'){
 Write-Host 'STAGE3W LAB HTTP SMOKE BLOCKED: fiscal endpoint still LAB-disabled' -ForegroundColor Yellow
 Write-Host ('Report: '+$report)
 throw 'Stage3W smoke BLOCKED: enable flags / restart dev-api with .env.stage3w.lab.local'
}
if($code -eq 404){
 throw 'Stage3W smoke BLOCKED: route missing (dev-api not studio-aware?)'
}
if($code -ne 401 -and $code -ne 403 -and $code -ne 400){
 Write-Host ('Unexpected HTTP '+$code+' — inspect report') -ForegroundColor Yellow
 Write-Host ('Report: '+$report)
 throw ('Stage3W smoke unexpected HTTP '+$code)
}
Write-Host 'STAGE3W LAB HTTP SMOKE PASS (endpoint enabled; auth required)' -ForegroundColor Green
Write-Host ('Report: '+$report)
Write-Host 'Next: login in Vite UI and save one fattura attiva; confirm PN via SQL if needed.'
