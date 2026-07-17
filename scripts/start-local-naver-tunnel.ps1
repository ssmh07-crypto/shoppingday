param(
  [switch]$SkipWorkerUpdate,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
$relayEnvFile = Join-Path $projectRoot ".env.relay.local"
$relayOutLog = Join-Path $env:TEMP "shoppingday-naver-relay.out.log"
$relayErrorLog = Join-Path $env:TEMP "shoppingday-naver-relay.error.log"
$tunnelOutLog = Join-Path $env:TEMP "shoppingday-cloudflared.out.log"
$tunnelErrorLog = Join-Path $env:TEMP "shoppingday-cloudflared.error.log"

Set-Location $projectRoot

function Get-DotEnvValue {
  param([string]$Name)

  if (-not (Test-Path -LiteralPath $envFile)) {
    throw ".env.local file was not found."
  }
  $prefix = "$Name="
  $line = Get-Content -LiteralPath $envFile -Encoding utf8 |
    Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) } |
    Select-Object -Last 1
  if (-not $line) { return $null }
  $value = $line.Substring($prefix.Length).Trim()
  if (
    $value.Length -ge 2 -and
    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))
  ) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Assert-RequiredSetting {
  param([string]$Name)

  if ([string]::IsNullOrWhiteSpace((Get-DotEnvValue -Name $Name))) {
    throw "$Name is missing from .env.local."
  }
}

function Get-OrCreateRelaySecret {
  $existing = $null
  if (Test-Path -LiteralPath $relayEnvFile) {
    $line = Get-Content -LiteralPath $relayEnvFile -Encoding utf8 |
      ForEach-Object { $_.TrimStart([char]0xFEFF) } |
      Where-Object { $_.StartsWith("NAVER_COMMERCE_RELAY_SHARED_SECRET=", [StringComparison]::Ordinal) } |
      Select-Object -Last 1
    if ($line) { $existing = $line.Split("=", 2)[1].Trim() }
  }
  if (-not [string]::IsNullOrWhiteSpace($existing)) {
    if ($existing.Length -lt 32) {
      throw "NAVER_COMMERCE_RELAY_SHARED_SECRET must be at least 32 characters."
    }
    return $existing
  }

  $bytes = [byte[]]::new(48)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $secret = [Convert]::ToBase64String($bytes)
  $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText(
    $relayEnvFile,
    "NAVER_COMMERCE_RELAY_SHARED_SECRET=$secret`n",
    $utf8WithoutBom
  )
  Write-Host "Created a relay shared secret in .env.relay.local."
  return $secret
}

function Get-CloudflaredPath {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $wingetLink = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe"
  if (Test-Path -LiteralPath $wingetLink) { return $wingetLink }
  throw "cloudflared is not installed or is not available on PATH."
}

function Wait-ForRelay {
  param([Diagnostics.Process]$Process)

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    if ($Process.HasExited) {
      throw "The local relay stopped during startup. Check $relayErrorLog"
    }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8788/healthz" -TimeoutSec 1
      if ($health.status -eq "ok") { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "The local relay did not become healthy. Check $relayErrorLog"
}

function Wait-ForTunnelUrl {
  param([Diagnostics.Process]$Process)

  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if ($Process.HasExited) {
      throw "Cloudflare Tunnel stopped during startup. Check $tunnelErrorLog"
    }
    $logs = @()
    if (Test-Path -LiteralPath $tunnelOutLog) {
      $logs += Get-Content -LiteralPath $tunnelOutLog -Raw -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $tunnelErrorLog) {
      $logs += Get-Content -LiteralPath $tunnelErrorLog -Raw -ErrorAction SilentlyContinue
    }
    $match = [regex]::Match(($logs -join "`n"), "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) { return $match.Value }
    Start-Sleep -Milliseconds 500
  }
  throw "Cloudflare Tunnel did not provide a public URL. Check $tunnelErrorLog"
}

function Update-WorkerRelaySettings {
  param(
    [string]$TunnelUrl,
    [string]$SharedSecret
  )

  $whoami = (& npx wrangler whoami 2>&1 | Out-String)
  if ($whoami -match "not authenticated") {
    throw "Wrangler is not logged in. Run 'npx wrangler login --use-keyring' first."
  }

  $SharedSecret | & npx wrangler secret put NAVER_COMMERCE_RELAY_SHARED_SECRET
  if ($LASTEXITCODE -ne 0) { throw "Failed to update the Worker relay secret." }

  $TunnelUrl | & npx wrangler secret put NAVER_COMMERCE_RELAY_URL_OVERRIDE
  if ($LASTEXITCODE -ne 0) { throw "Failed to update the Worker relay URL." }
}

Assert-RequiredSetting -Name "NAVER_COMMERCE_CLIENT_ID"
Assert-RequiredSetting -Name "NAVER_COMMERCE_CLIENT_SECRET"
$relaySecret = Get-OrCreateRelaySecret
$cloudflaredPath = Get-CloudflaredPath

foreach ($log in @($relayOutLog, $relayErrorLog, $tunnelOutLog, $tunnelErrorLog)) {
  Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
}

$relay = $null
$tunnel = $null
try {
  $relay = Start-Process -FilePath "node.exe" -ArgumentList @(
    "--env-file=$envFile",
    "--env-file=$relayEnvFile",
    "--import",
    "tsx",
    "scripts/naver-commerce-relay.ts"
  ) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $relayOutLog -RedirectStandardError $relayErrorLog
  Wait-ForRelay -Process $relay
  Write-Host "Local Naver relay is healthy."

  $tunnel = Start-Process -FilePath $cloudflaredPath -ArgumentList @(
    "tunnel",
    "--url",
    "http://127.0.0.1:8788",
    "--no-autoupdate"
  ) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrorLog
  $tunnelUrl = Wait-ForTunnelUrl -Process $tunnel
  Write-Host "Cloudflare Tunnel: $tunnelUrl"

  if ($VerifyOnly) {
    Write-Host "Local relay and tunnel verification passed."
    return
  }

  if (-not $SkipWorkerUpdate) {
    Write-Host "Updating and deploying the Worker relay settings..."
    Update-WorkerRelaySettings -TunnelUrl $tunnelUrl -SharedSecret $relaySecret
    Write-Host "Worker is connected to the local relay."
  } else {
    Write-Host "Worker update was skipped."
  }

  Write-Host "Keep this window open. Press Ctrl+C to stop the relay and tunnel."
  while (-not $relay.HasExited -and -not $tunnel.HasExited) {
    Start-Sleep -Seconds 2
  }
  throw "The relay or tunnel stopped unexpectedly."
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  if ($relay -and -not $relay.HasExited) { Stop-Process -Id $relay.Id -Force }
}
