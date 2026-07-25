param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName = "Shoppingday Naver Quick Tunnel"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "start-local-naver-tunnel.ps1"

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  Write-Host "Removed the Shoppingday Naver Quick Tunnel auto-start task."
  return
}

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Tunnel runner was not found: $runnerPath"
}

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedRunnerPath = $runnerPath.Replace('"', '""')
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$escapedRunnerPath`"" `
  -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Starts Shoppingday's Naver Commerce relay and Cloudflare Quick Tunnel at Windows logon."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Write-Host "Registered '$taskName' for $userId."
Write-Host "It will start at Windows logon and restart one minute after an unexpected exit."
