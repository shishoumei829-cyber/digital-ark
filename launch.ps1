# Digital Ark launcher - ASCII only (Windows PowerShell 5.1 safe)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$PcUrl     = 'http://127.0.0.1:3000/apps/sanctuary.html'
$Health    = 'http://127.0.0.1:3000/health'
$Ollama    = 'http://127.0.0.1:11434/api/tags'
$RootDir   = Split-Path $PSScriptRoot -Parent
$UrlFile   = Join-Path $RootDir 'urls.txt'
$PhoneHost = 'kurisumakise'

function Write-Step([string]$msg) { Write-Host "  $msg" }

function Wait-Key {
    Write-Host ''
    Read-Host 'Press Enter to close'
}

function Test-HttpOk([string]$url, [int]$sec = 2) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $sec
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function Ensure-Firewall {
    $rule = Get-NetFirewallRule -DisplayName 'Digital Ark 3000' -ErrorAction SilentlyContinue
    if ($rule) { return 'ok' }
    try {
        New-NetFirewallRule -DisplayName 'Digital Ark 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -ErrorAction Stop | Out-Null
        return 'created'
    } catch {
        return 'need_admin'
    }
}

function Ensure-Ollama {
    if (Test-HttpOk $Ollama 2) { return 'running' }
    Write-Step '[1/4] Starting Ollama...'
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\Ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\Ollama.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Ollama\Ollama.exe')
    )
    $started = $false
    foreach ($exe in $candidates) {
        if (Test-Path $exe) {
            Start-Process -FilePath $exe -WindowStyle Hidden
            $started = $true
            break
        }
    }
    if (-not $started -and (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Start-Process cmd.exe -ArgumentList '/c', 'start /min ollama serve' -WindowStyle Hidden
        $started = $true
    }
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 800
        if (Test-HttpOk $Ollama 2) { return 'started' }
    }
    if ($started) { return 'slow' }
    return 'missing'
}

function Ensure-Server {
    if (Test-HttpOk $Health 2) { return 'running' }
    Write-Step '[2/4] Starting server...'
    $serverDir = $PSScriptRoot
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$serverDir`" && title Digital-Ark-Server && node server.js"
    for ($i = 0; $i -lt 35; $i++) {
        Start-Sleep -Milliseconds 800
        if (Test-HttpOk $Health 2) { return 'started' }
    }
    return 'slow'
}

function Get-PhoneUrl {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        try {
            $ip = (tailscale ip -4 2>$null | Select-Object -First 1).Trim()
            if ($ip) {
                return "http://${PhoneHost}:3000/apps/sanctuary.html", "http://${ip}:3000/apps/sanctuary.html"
            }
        } catch {}
    }
    return "http://${PhoneHost}:3000/apps/sanctuary.html", $null
}

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host '[ERROR] Node.js not found: https://nodejs.org/'
        Wait-Key
        exit 1
    }

    if (-not (Test-Path 'node_modules\express')) {
        Write-Step 'Installing npm packages...'
        npm install --omit=dev 2>&1 | Out-Null
    }

    $ollamaState = Ensure-Ollama
    switch ($ollamaState) {
        'running' { Write-Step '[1/4] Ollama OK' }
        'started' { Write-Step '[1/4] Ollama started' }
        'slow'    { Write-Step '[1/4] Ollama slow' }
        'missing' { Write-Step '[1/4] WARN: Ollama not found' }
    }

    $fw = Ensure-Firewall
    if ($fw -eq 'created') { Write-Step '[FW] Phone access rule added' }
    elseif ($fw -eq 'need_admin') { Write-Step '[FW] Run allow-phone-access.bat as admin once' }

    $serverState = Ensure-Server
    switch ($serverState) {
        'running' { Write-Step '[2/4] Server OK' }
        'started' { Write-Step '[2/4] Server started - keep Digital-Ark-Server window' }
        'slow'    { Write-Step '[2/4] Server slow - opening browser anyway' }
    }

    $phoneUrl, $phoneFallback = Get-PhoneUrl

    Write-Step '[3/4] Opening browser...'
    Start-Process $PcUrl

    $urlText = @(
        'Digital Ark URLs'
        '================'
        ''
        'PC:'
        $PcUrl
        ''
        'Phone (Tailscale):'
        $phoneUrl
    )
    if ($phoneFallback) {
        $urlText += @('', 'Phone fallback:', $phoneFallback)
    }
    if ($fw -eq 'need_admin') {
        $allowBat = Join-Path $RootDir ([string][char]0x653E + [char]0x884C + [char]0x624B + [char]0x673A + [char]0x8BBF + [char]0x95EE + '.bat')
        $urlText += @('', 'First phone access - admin run:', $allowBat)
    }
    $urlText += @('', 'Keep Digital-Ark-Server window open.')
    $urlText -join "`r`n" | Set-Content -Path $UrlFile -Encoding UTF8

    # Also write Chinese memo if legacy file name exists beside urls.txt
    $legacyUrl = Join-Path $RootDir ([string][char]0x7F51 + [char]0x5740 + '.txt')
    $urlText -join "`r`n" | Set-Content -Path $legacyUrl -Encoding UTF8

    Write-Host ''
    Write-Host '  PC:    ' $PcUrl
    Write-Host '  Phone: ' $phoneUrl
    Write-Host ''
    Write-Host '  Done. Window closes in 5s. Server keeps running.'
    Write-Host ''

    Start-Sleep -Seconds 5
} catch {
    Write-Host ''
    Write-Host '[ERROR]' $_.Exception.Message
    Wait-Key
    exit 1
}
