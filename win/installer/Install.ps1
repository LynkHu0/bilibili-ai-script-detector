$ErrorActionPreference = 'Stop'
try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'This package requires 64-bit Windows 10/11.' }
    $source = Join-Path $PSScriptRoot 'app'
    $target = Join-Path $env:LOCALAPPDATA 'BiliSlop'
    $data = Join-Path $env:LOCALAPPDATA 'BiliSlopData'
    $node = Join-Path $target 'runtime\node.exe'
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -eq $node } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    New-Item -ItemType Directory -Force -Path $target,$data | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launch.ps1') -Destination $target -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Stop.ps1') -Destination $target -Force
    foreach ($file in @('Stop.cmd','Uninstall.ps1','Uninstall.cmd')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $target -Force }
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $data /inheritance:r /grant:r "*$($sid):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to protect the account data directory.' }
    $shell = New-Object -ComObject WScript.Shell
    $desktop = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'B站文案检测设置.lnk'))
    $desktop.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $desktop.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $target 'Launch.ps1') + '" -OpenSettings'
    $desktop.WorkingDirectory = $target
    $desktop.Save()
    $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'BiliSlop.lnk'
    if ((Read-Host '是否登录 Windows 后自动启动？输入 Y 开启，其他键跳过') -match '^[Yy]$') {
        $link = $shell.CreateShortcut($startup)
        $link.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $target 'Launch.ps1') + '"'
        $link.WorkingDirectory = $target
        $link.Save()
    }
    Start-Process -WindowStyle Hidden -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $target 'Launch.ps1') + '"')
    $ready = $false
    for ($i=0; $i -lt 30; $i++) {
        try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17653/' -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ready=$true; break } } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw '本地服务未启动。请检查 17653 端口或 Windows 安全中心拦截记录。' }
    Start-Process 'http://127.0.0.1:17653/'
    Start-Process explorer.exe -ArgumentList ('"' + (Join-Path $target 'extension') + '"')
    Write-Host '安装完成。Edge 打开 edge://extensions，开启开发人员模式，加载刚打开的 extension 文件夹。' -ForegroundColor Green
    Write-Host ('插件文件夹：' + (Join-Path $target 'extension'))
    Write-Host '然后在网页设置页配置你自己的 ChatGPT 登录或 DeepSeek API Key，插件会自动连接本机服务。'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
