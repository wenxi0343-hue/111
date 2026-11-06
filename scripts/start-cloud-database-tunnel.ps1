param(
  [Parameter(Mandatory = $true)][string]$ServerAddress,
  [Parameter(Mandatory = $true)][string]$LoginUser,
  [Parameter(Mandatory = $true)][string]$IdentityFile,
  [Parameter(Mandatory = $true)][string]$KnownHostsFile,
  [ValidateRange(1024, 65535)][int]$RemotePort = 15432,
  [ValidateRange(1, 65535)][int]$DatabasePort = 5432
)

$ErrorActionPreference = 'Stop'
$resolvedIdentity = (Resolve-Path -LiteralPath $IdentityFile).Path
$resolvedKnownHosts = (Resolve-Path -LiteralPath $KnownHostsFile).Path
$sshExecutable = (Get-Command ssh.exe -ErrorAction Stop).Source
$tunnelMutex = [System.Threading.Mutex]::new($false, 'Local\PaperMatchingCloudDatabaseTunnel')
$ownsMutex = $false

try {
  try {
    $ownsMutex = $tunnelMutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $ownsMutex = $true
  }
  if (-not $ownsMutex) { exit 0 }

  $sshArguments = @(
    '-N', '-T', '-i', $resolvedIdentity,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$resolvedKnownHosts",
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-R', "127.0.0.1:${RemotePort}:127.0.0.1:${DatabasePort}",
    "${LoginUser}@${ServerAddress}"
  )

  while ($true) {
    & $sshExecutable @sshArguments
    Start-Sleep -Seconds 10
  }
} finally {
  if ($ownsMutex) { $tunnelMutex.ReleaseMutex() }
  $tunnelMutex.Dispose()
}
