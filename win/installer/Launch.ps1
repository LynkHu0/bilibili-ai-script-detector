param([switch]$OpenSettings)
$ErrorActionPreference = 'Stop'
$app = $PSScriptRoot
$node = Join-Path $app 'runtime\node.exe'
$server = Join-Path $app 'local-server\server.mjs'
$running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -eq $node }).Count -gt 0
if (-not $running) {
    $env:BILI_SLOP_DATA_DIR = Join-Path $env:LOCALAPPDATA 'BiliSlopData'
    Start-Process -FilePath $node -ArgumentList ('"' + $server + '"') -WorkingDirectory (Join-Path $app 'local-server') -WindowStyle Hidden
}
if ($OpenSettings) { Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:17653/' }
