# Stage3W: start isolated LAB UI stack (dev-api + Vite) with fiscal persist flags.
# Does NOT touch LIVE Supabase. Does NOT install SQL. Windows P0 LAB only.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658',
 [string]$KongContainer='supabase_kong_FiscoSim-P0-LAB-20261008-164658',
 [switch]$SkipStart
)
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W LAB UI: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W LAB UI: pinned commit mismatch'
}
$running=(& docker inspect --format '{{.State.Running}}' $Container 2>&1)
if($LASTEXITCODE -ne 0 -or ($running -join '').Trim() -ne 'true'){
 throw 'Stage3W LAB UI: PostgreSQL container not running'
}
$kongRunning=(& docker inspect --format '{{.State.Running}}' $KongContainer 2>&1)
if($LASTEXITCODE -ne 0 -or ($kongRunning -join '').Trim() -ne 'true'){
 throw 'Stage3W LAB UI: Kong P0 container not running (need 55321)'
}

function Read-EnvFile([string]$Path){
 $map=@{}
 if(!(Test-Path -LiteralPath $Path -PathType Leaf)){ return $map }
 Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
  $line=$_.Trim()
  if(-not $line -or $line.StartsWith('#')){ return }
  $i=$line.IndexOf('=')
  if($i -lt 1){ return }
  $k=$line.Substring(0,$i).Trim()
  $v=$line.Substring($i+1).Trim().Trim('"').Trim("'")
  if($k){ $map[$k]=$v }
 }
 return $map
}

$candidates=@(
 (Join-Path $Lab '.env'),
 (Join-Path $Lab 'supabase\.env'),
 (Join-Path $Lab 'FiscoSim-P0-LAB.env'),
 (Join-Path $repo '.env'),
 (Join-Path $repo '.env.local')
)
$merged=@{}
foreach($c in $candidates){
 $part=Read-EnvFile $c
 foreach($k in $part.Keys){ if(-not $merged.ContainsKey($k) -or -not $merged[$k]){ $merged[$k]=$part[$k] } }
}
$service=([string]($merged['SUPABASE_SERVICE_ROLE_KEY']|Where-Object {$_})).Trim()
$anon=([string]($merged['VITE_SUPABASE_ANON_KEY']|Where-Object {$_})).Trim()
if(-not $anon){ $anon=([string]($merged['SUPABASE_ANON_KEY']|Where-Object {$_})).Trim() }
if(-not $service){ throw 'Stage3W LAB UI: SUPABASE_SERVICE_ROLE_KEY missing in LAB/.env candidates' }
if(-not $anon){ throw 'Stage3W LAB UI: ANON key missing in LAB/.env candidates' }

$origin='http://127.0.0.1:55321'
$envFile=Join-Path $repo '.env.stage3w.lab.local'
@(
 '# AUTO-GENERATED for Stage3W LAB UI — do not commit secrets',
 'FISCOSIM_ISOLATED_LAB_API=true',
 'FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED=true',
 'FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB_ENABLED=true',
 'VITE_FISCOSIM_FISCAL_JOURNAL_PERSIST_LAB=true',
 ('SUPABASE_URL='+$origin),
 ('VITE_SUPABASE_URL='+$origin),
 ('SUPABASE_SERVICE_ROLE_KEY='+$service),
 ('VITE_SUPABASE_ANON_KEY='+$anon),
 ('SUPABASE_ANON_KEY='+$anon),
 'PORT=3001'
) | Set-Content -LiteralPath $envFile -Encoding UTF8

$report=Join-Path $Lab ('STAGE3W_LAB_UI_STACK_'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'.txt')
@(
 'STAGE3W_LAB_UI_STACK',
 ('COMMIT='+$sha.Trim()),
 ('LAB_ONLY='+$Container),
 ('KONG='+$KongContainer),
 ('SUPABASE_URL='+$origin),
 ('ENV_FILE='+$envFile),
 'FISCAL_PERSIST_LAB=true',
 'LIVE_SUPABASE=false'
) | Set-Content -LiteralPath $report -Encoding UTF8

Write-Host 'Stage3W LAB env written:' $envFile -ForegroundColor Green
Write-Host 'Report:' $report

if($SkipStart){
 Write-Host 'SkipStart: launch manually with dotenv from .env.stage3w.lab.local'
 return
}

# Launch API + Vite in separate windows with the same env block.
$boot=@"
`$ErrorActionPreference='Stop'
Set-Location -LiteralPath '$repo'
Get-Content -LiteralPath '$envFile' | ForEach-Object {
  `$line=`$_.Trim()
  if(-not `$line -or `$line.StartsWith('#')){ return }
  `$i=`$line.IndexOf('=')
  if(`$i -lt 1){ return }
  Set-Item -Path ('Env:'+`$line.Substring(0,`$i).Trim()) -Value `$line.Substring(`$i+1).Trim()
}
Write-Host 'Stage3W LAB env loaded. Starting...' -ForegroundColor Cyan
"@

$apiCmd=$boot + @"
node -r dotenv/config scripts/dev-api.mjs
"@
$viteCmd=$boot + @"
npx vite --port 5173 --strictPort
"@

Start-Process powershell -ArgumentList @('-NoExit','-Command',$apiCmd) | Out-Null
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @('-NoExit','-Command',$viteCmd) | Out-Null

Write-Host 'Started two windows: dev-api :3001 and Vite :5173' -ForegroundColor Green
Write-Host 'Open http://127.0.0.1:5173 — login owner/admin on P0 LAB — save a fattura attiva.'
Write-Host 'Then run: .\scripts\security_p0\smoke-stage3w-fiscal-lab-http.ps1 -ExpectedCommit' $sha.Trim()
