$node = Join-Path $env:LOCALAPPDATA 'BiliSlop\runtime\node.exe'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -eq $node } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'BiliSlop stopped.'
