# Stage3W: start isolated LAB UI stack (dev-api + Vite) with fiscal persist flags.
# Does NOT touch LIVE Supabase. Does NOT install SQL. Windows P0 LAB only.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ExpectedCommit,
 [string]$Lab='C:\Users\patri\FiscoSim-P0-LAB-20261008-164658',
 [string]$Container='supabase_db_FiscoSim-P0-LAB-20261008-164658',
 [string]$KongContainer='supabase_kong_FiscoSim-P0-LAB-20261008-164658',
 [string]$AuthContainer='supabase_auth_FiscoSim-P0-LAB-20261008-164658',
 [string]$ServiceRoleKey='',
 [string]$AnonKey='',
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

function Assert-DockerDaemon(){
 $probe=(& docker info 2>&1)
 if($LASTEXITCODE -ne 0){
  $txt=(@($probe) -join ' ')
  if($txt -match 'dockerDesktopLinuxEngine|cannot connect|Is the docker daemon running|Impossibile trovare'){
   throw 'Stage3W LAB UI: Docker Desktop is NOT running. Start Docker Desktop, wait until it is Ready, then re-run this script.'
  }
  throw ('Stage3W LAB UI: docker unavailable: '+$txt)
 }
}
function Assert-ContainerRunning([string]$Name,[string]$Label){
 $running=(& docker inspect --format '{{.State.Running}}' $Name 2>&1)
 if($LASTEXITCODE -ne 0){ throw ("Stage3W LAB UI: missing container "+$Name+" ("+$Label+") — start the P0 LAB stack first") }
 if((@($running) -join '').Trim() -ne 'true'){ throw ("Stage3W LAB UI: container not running "+$Name) }
}
Assert-DockerDaemon
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

function Merge-Map($target,$source){
 foreach($k in @($source.Keys)){
  $cur=Get-MapVal $target $k
  if($cur.Length -eq 0 -and $null -ne $source[$k] -and ([string]$source[$k]).Trim().Length -gt 0){
   $target[$k]=([string]$source[$k]).Trim()
  }
 }
}

function Import-DockerInspectEnv([string]$Name,$map){
 $lines=@(& docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $Name 2>&1)
 if($LASTEXITCODE -ne 0){ return }
 foreach($raw in $lines){
  if($null -eq $raw){ continue }
  $line=([string]$raw).Trim()
  $i=$line.IndexOf('=')
  if($i -lt 1){ continue }
  $k=$line.Substring(0,$i).Trim()
  $v=$line.Substring($i+1).Trim()
  if($k.Length -eq 0 -or $v.Length -eq 0){ continue }
  $cur=Get-MapVal $map $k
  if($cur.Length -eq 0){ $map[$k]=$v }
 }
}

$merged=@{}
$found=@()

# 1) Explicit params
if($ServiceRoleKey.Trim().Length -gt 0){ $merged['SUPABASE_SERVICE_ROLE_KEY']=$ServiceRoleKey.Trim() }
if($AnonKey.Trim().Length -gt 0){ $merged['VITE_SUPABASE_ANON_KEY']=$AnonKey.Trim() }

# 2) Recursive .env* under LAB folder + common repo files
$envFiles=@()
try{
 $envFiles += @(Get-ChildItem -LiteralPath $Lab -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^\.env' -or $_.Name -match '\.env$' -or $_.Name -match 'FiscoSim-P0.*\.env' } |
  Select-Object -First 40 -ExpandProperty FullName)
}catch{}
$envFiles += @(
 (Join-Path $repo '.env'),
 (Join-Path $repo '.env.local'),
 (Join-Path $repo '.env.stage3w.lab.local'),
 (Join-Path $env:USERPROFILE '.supabase\FiscoSim-P0-LAB.env')
)
foreach($c in ($envFiles | Select-Object -Unique)){
 if(-not $c -or !(Test-Path -LiteralPath $c -PathType Leaf)){ continue }
 $found += $c
 Merge-Map $merged (Read-EnvFile $c)
}
Write-Host ('Env files found: '+($(if($found.Count){($found | Select-Object -First 8) -join '; '}else{'(none)'})))

# 3) Docker inspect env from all P0 LAB containers
$p0Names=@(& docker ps --format '{{.Names}}' 2>&1 | Where-Object { $_ -match 'FiscoSim-P0-LAB-20261008-164658' })
foreach($n in $p0Names){ Import-DockerInspectEnv $n $merged }
Write-Host ('P0 containers inspected for keys: '+($(if($p0Names){$p0Names -join ', '}else{'(none)'})))

# Resolve with many aliases used by Supabase compose / GoTrue / Kong
function First-Key($map,[string[]]$names){
 foreach($n in $names){
  $v=Get-MapVal $map $n
  if($v.Length -gt 0){ return $v }
 }
 return ''
}
$service=First-Key $merged @(
 'SUPABASE_SERVICE_ROLE_KEY','SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY',
 'JWT_SERVICE_ROLE_KEY','SERVICE_KEY'
)
$anon=First-Key $merged @(
 'VITE_SUPABASE_ANON_KEY','SUPABASE_ANON_KEY','ANON_KEY',
 'SUPABASE_ANON_KEY_JWT','PUBLISHABLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY'
)

if($service.Length -eq 0 -or $anon.Length -eq 0){
 Write-Host '--- KEY DISCOVERY FAILED ---' -ForegroundColor Yellow
 Write-Host 'Run this and paste ONLY the variable NAMES (not values) if still stuck:' -ForegroundColor Yellow
 Write-Host ("docker inspect $AuthContainer --format '{{range .Config.Env}}{{println .}}{{end}}' | findstr /i KEY")
 Write-Host 'Or pass keys explicitly:' -ForegroundColor Yellow
 Write-Host '.\scripts\security_p0\start-stage3w-lab-ui-stack.ps1 -ExpectedCommit $sha -ServiceRoleKey "..." -AnonKey "..."'
 $have=@(
  ($merged.Keys | Where-Object { $_ -match 'KEY|ANON|SERVICE|JWT|SECRET' } | Sort-Object)
 ) -join ', '
 Write-Host ('Key-like names currently seen (no values): '+$(if($have){$have}else{'(none)'}))
 if($service.Length -eq 0){ throw 'Stage3W LAB UI: SERVICE_ROLE key missing' }
 if($anon.Length -eq 0){ throw 'Stage3W LAB UI: ANON key missing' }
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
 ('ENV_SOURCES_COUNT='+$found.Count),
 'KEYS_RESOLVED=true',
 'FISCAL_PERSIST_LAB=true',
 'LIVE_SUPABASE=false'
) | Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ('Stage3W LAB env written: '+$envFile) -ForegroundColor Green
Write-Host ('Report: '+$report)

if($SkipStart){
 Write-Host 'SkipStart set — not launching processes'
 return
}

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
# Must separate boot from launch with a newline (else "Cyan"+"npx" => "Cyannpx").
$apiCmd=$boot + "`nnode scripts/dev-api.mjs`n"
$viteCmd=$boot + "`nnpx vite --port 5173 --strictPort`n"
Start-Process powershell -ArgumentList @('-NoExit','-Command',$apiCmd) | Out-Null
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList @('-NoExit','-Command',$viteCmd) | Out-Null
Write-Host 'Started windows: dev-api :3001 and Vite :5173' -ForegroundColor Green
Write-Host 'Next: .\scripts\security_p0\smoke-stage3w-fiscal-lab-http.ps1 -ExpectedCommit' $sha
