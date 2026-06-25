$desktop = [Environment]::GetFolderPath('Desktop')
$target = 'E:\数字方舟\启动.bat'
$shortcut = Join-Path $desktop '数字方舟.lnk'
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($shortcut)
$lnk.TargetPath = $target
$lnk.WorkingDirectory = 'E:\数字方舟'
$lnk.WindowStyle = 1
$lnk.Description = '一键启动数字方舟（Ollama + 服务 + 浏览器）'
$lnk.Save()
Write-Host "已创建桌面快捷方式: $shortcut"
