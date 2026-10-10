# Stage3W: start isolated LAB UI stack (dev-api + Vite) with fiscal persist flags.
# Does NOT touch LIVE Supabase. Does NOT install SQL. Windows P0 LAB only.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658',
 [string]$KongContainer='supabase_kong_FiscoSim-P0-LAB-20261008-164658',
 [string]$AuthContainer='supabase_auth_FiscoSim-P0-LAB-20261008-164658',
 [switch]$SkipStart
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$expectedContainer='supabase_db_FiscoSim-P0-LAB-20261008-164658'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if($Container -ne $expectedContainer -or !(Test-Path -LiteralPath $Lab -PathType Container)){
 throw 'Stage3W LAB UI: isolated LAB identity mismatch'
}
$sha=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or -not $sha -or $sha.Trim() -ne $ExpectedCommit){
 throw 'Stage3W LAB UI: pinned commit mismatch'
}
$sha=$sha.Trim()

function Assert-ContainerRunning([string]$Name,[string]$Label){
 $running=(& docker inspect --format '{{.State.Running}}' $Name 2>&1)
 if($LASTEXITCODE -ne 0){ throw ("Stage3W LAB UI: missing container "+$Name+" ("+$Label+")") }
 if((@($running) -join '').Trim() -ne 'true'){ throw ("Stage3W LAB UI: container not running "+$Name) }
}
Assert-ContainerRunning $Container 'PostgreSQL'
Assert-ContainerRunning $KongContainer 'Kong 55321'
Assert-ContainerRunning $AuthContainer 'GoTrue Auth'

function Read-EnvFile([string]$Path){
 $map=@{}
 if(!(Test-Path -LiteralPath $Path -PathType Leaf)){ return $map }
 foreach($raw in Get-Content -LiteralPath $Path -Encoding UTF8){
  if($null -eq $raw){ continue }
  $line=([string]$raw).Trim()
  if($line.Length -eq 0 -or $line.StartsWith('#')){ continue }
  $i=$line.IndexOf('=')
  if($i -lt 1){ continue }
  $k=$line.Substring(0,$i).Trim()
  $v=$line.Substring($i+1).Trim().Trim('"').Trim("'")
  if($k.Length -gt 0){ $map[$k]=$v }
 }
 return $map
}

function Get-MapVal($map,[string]$key){
 if($null -eq $map){ return '' }
 if(-not $map.ContainsKey($key)){ return '' }
 if($null -eq $map[$key]){ return '' }
 return ([string]$map[$key]).Trim()
}

function Get-DockerEnv([string]$Name,[string]$Key){
 $out=(& docker exec $Name printenv $Key 2>&1)
 if($LASTEXITCODE -ne 0){ return '' }
 return (@($out) -join '').Trim()
}

$candidates=@(
 (Join-Path $Lab '.env'),
 (Join-Path $Lab 'supabase\.env'),
 (Join-Path $Lab 'supabase\docker\.env'),
 (Join-Path $Lab 'FiscoSim-P0-LAB.env'),
 (Join-Path $repo '.env'),
 (Join-Path $repo '.env.local'),
 (Join-Path $repo '.env.stage3w.lab.local')
)
$merged=@{}
$found=@()
foreach($c in $candidates){
 if(!(Test-Path -LiteralPath $c -PathType Leaf)){ continue }
 $found += $c
 $part=Read-EnvFile $c
 foreach($k in @($part.Keys)){
  $cur=Get-MapVal $merged $k
  if($cur.Length -eq 0){ $merged[$k]=$part[$k] }
 }
}
Write-Host ('Env files found: '+($(if($found.Count){$found -join '; '}else{'(none)'})))

$service=Get-MapVal $merged 'SUPABASE_SERVICE_ROLE_KEY'
if($service.Length -eq 0){ $service=Get-MapVal $merged 'SERVICE_ROLE_KEY' }
$anon=Get-MapVal $merged 'VITE_SUPABASE_ANON_KEY'
if($anon.Length -eq 0){ $anon=Get-MapVal $merged 'SUPABASE_ANON_KEY' }
if($anon.Length -eq 0){ $anon=Get-MapVal $merged 'ANON_KEY' }

if($service.Length -eq 0){ $service=Get-DockerEnv $AuthContainer 'SERVICE_ROLE_KEY' }
if($service.Length -eq 0){ $service=Get-DockerEnv $KongContainer 'SUPABASE_SERVICE_KEY' }
if($anon.Length -eq 0){ $anon=Get-DockerEnv $AuthContainer 'ANON_KEY' }
if($anon.Length -eq 0){ $anon=Get-DockerEnv $KongContainer 'SUPABASE_ANON_KEY' }

if($service.Length -eq 0){
 throw 'Stage3W LAB UI: SERVICE_ROLE key missing (put SUPABASE_SERVICE_ROLE_KEY in LAB .env or ensure Auth container env)'
}
if($anon.Length -eq 0){
 throw 'Stage3W LAB UI: ANON key missing (VITE_SUPABASE_ANON_KEY / ANON_KEY)'
}

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
 ('COMMIT='+$sha),
 ('LAB_ONLY='+$Container),
 ('KONG='+$KongContainer),
 ('AUTH='+$AuthContainer),
 ('SUPABASE_URL='+$origin),
 ('ENV_FILE='+$envFile),
 ('ENV_SOURCES='+($found -join '|')),
 'FISCAL_PERSIST_LAB=true',
 'LIVE_SUPABASE=false'
) | Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ('Stage3W LAB env written: '+$envFile) -ForegroundColor Green
Write-Host ('Report: '+$report)

if($SkipStart){
 Write-Host 'SkipStart set — not launching processes'
 return
}

# Free stale :3001 / :5173 listeners so smoke does not hit the wrong process.
foreach($port in 3001,5173){
 try{
  $pids=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach($procId in $pids){
   if($procId -and $procId -gt 0){
    Write-Host ("Stopping stale PID "+$procId+" on port "+$port) -ForegroundColor Yellow
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
   }
  }
 }catch{}
}

$boot=@"
`$ErrorActionPreference='Stop'
Set-Location -LiteralPath '$repo'
Get-Content -LiteralPath '$envFile' | ForEach-Object {
  if(`$null -eq `$_){ return }
  `$line=([string]`$_).Trim()
  if(`$line.Length -eq 0 -or `$line.StartsWith('#')){ return }
  `$i=`$line.IndexOf('=')
  if(`$i -lt 1){ return }
  Set-Item -Path ('Env:'+`$line.Substring(0,`$i).Trim()) -Value `$line.Substring(`$i+1).Trim()
}
Write-Host 'Stage3W LAB env loaded. Starting...' -ForegroundColor Cyan
"@

$apiCmd=$boot + "node scripts/dev-api.mjs"
$viteCmd=$boot + "npx vite --port 5173 --strictPort"

Start-Process powershell -ArgumentList @('-NoExit','-Command',$apiCmd) | Out-Null
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList @('-NoExit','-Command',$viteCmd) | Out-Null

Write-Host 'Started windows: dev-api :3001 and Vite :5173' -ForegroundColor Green
Write-Host 'Next: .\scripts\security_p0\smoke-stage3w-fiscal-lab-http.ps1 -ExpectedCommit' $sha
Write-Host 'Then open http://127.0.0.1:5173 — login owner/admin — save one fattura attiva.'
