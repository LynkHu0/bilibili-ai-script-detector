$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'BiliSlop'
$node = Join-Path $target 'runtime\node.exe'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -eq $node } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
@((Join-Path ([Environment]::GetFolderPath('Startup')) 'BiliSlop.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'B站文案检测设置.lnk')) | ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
Write-Host '程序和自启动已移除。请在 Edge 手动移除扩展。'
Write-Host ('登录资料保留在：' + (Join-Path $env:LOCALAPPDATA 'BiliSlopData'))
