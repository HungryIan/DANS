<#
.SYNOPSIS
    Runs DANS for a presentation so other devices on the same network (Wi-Fi or LAN) can open it.

.DESCRIPTION
    1. Builds the website (the production build plus the demo sign-in buttons) into backend\Dans.Api\wwwroot.
    2. Starts the API so the website, the API and the live updates share one HTTPS address:
       https://localhost:7180 on this computer and https://<this computer's IP address>:7180 on other devices.

    It uses the Development settings, the same database (backend\Dans.Api\dans.db) and the demo accounts.
    For demonstrations only. Never use it for a real deployment (see "Production build" in README.md).
    Do not run the normal "dotnet run" / "npm start" servers at the same time.

.PARAMETER Reset
    Start from a fresh demo database (deletes backend\Dans.Api\dans.db first).

.PARAMETER SkipBuild
    Reuse the last website build (faster when nothing in frontend\ changed).

.PARAMETER Port
    HTTPS port (default 7180).

.EXAMPLE
    .\present.ps1

.EXAMPLE
    .\present.ps1 -Reset
#>
param(
    [switch]$Reset,
    [switch]$SkipBuild,
    [ValidateRange(1024, 65535)][int]$Port = 7180
)

$ErrorActionPreference = 'Stop'
$apiDir = Join-Path $PSScriptRoot 'backend\Dans.Api'
$webDir = Join-Path $PSScriptRoot 'frontend'
$httpPort = 5180   # plain HTTP on this computer only; it just redirects to HTTPS, like "dotnet run"

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "== $Text" -ForegroundColor Cyan
}

# ---------- 1. The ports must be free (only one DANS server at a time) ----------
foreach ($p in @($Port, $httpPort)) {
    $listener = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "Port $p is already used by $($owner.ProcessName) (process $($listener.OwningProcess))." -ForegroundColor Red
        Write-Host 'Stop the other DANS server first (press Ctrl+C in its window), then run this again.' -ForegroundColor Red
        exit 1
    }
}

# ---------- 2. Optional fresh database ----------
if ($Reset) {
    Write-Step 'Deleting the database (a fresh one with demo data is created on start)'
    foreach ($file in @('dans.db', 'dans.db-shm', 'dans.db-wal')) {
        $path = Join-Path $apiDir $file
        if (Test-Path $path) { Remove-Item $path -Force }
    }
}

# ---------- 3. Website build, served by the API from wwwroot ----------
if (-not $SkipBuild) {
    Write-Step 'Building the website (this takes about half a minute)'
    Push-Location $webDir
    try {
        if (-not (Test-Path 'node_modules')) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Check the messages above.' }
        }
        npm run build:presentation
        if ($LASTEXITCODE -ne 0) { throw 'The website build failed. Check the messages above.' }
    }
    finally { Pop-Location }
}
elseif (-not (Test-Path (Join-Path $apiDir 'wwwroot\index.html'))) {
    throw 'There is no website build yet. Run this again without -SkipBuild.'
}

# ---------- 4. Addresses ----------
# Addresses of network adapters that are connected (have a default gateway): what other devices should open.
$lanAddresses = @(Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address.IPAddress })
# The API only answers to these host names (protection against forged Host headers).
$allAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { $_.IPAddress })
$hostNames = @('localhost') + $allAddresses + @($env:COMPUTERNAME, "$($env:COMPUTERNAME).local") | Select-Object -Unique

# ---------- 5. Windows Firewall check ----------
# Other devices get in through an enabled inbound "Allow" rule for this port, or for Dans.Api.exe (the rule Windows
# creates when you click "Allow access" in its pop-up), that covers the current network type (Private/Public/Domain).
# netsh is used because Get-NetFirewallRule needs administrator rights. Its output is English-only, so on other
# Windows languages the check is skipped and only the reminder is shown.
$ruleName = "DANS presentation (TCP $Port)"
$addRuleCommand = "New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow"
$networkTypes = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    ForEach-Object { if ("$($_.NetworkCategory)" -eq 'DomainAuthenticated') { 'Domain' } else { "$($_.NetworkCategory)" } } |
    Select-Object -Unique)
$rules = @(((netsh advfirewall firewall show rule name=all dir=in verbose) -join "`n") -split '(?m)^Rule Name:' | Select-Object -Skip 1)
$forDans = @($rules | Where-Object {
        $_ -match '(?m)^Enabled:\s+Yes' -and $_ -notmatch '(?m)^Protocol:\s+UDP' -and
        ($_ -match "(?m)^LocalPort:\s+(.*,)?$Port(,.*)?\s*$" -or $_ -match '(?mi)^Program:\s+.*\\dans\.api\.exe\s*$')
    })
function Get-RuleProfile([string]$Rule) {
    if ($Rule -match '(?m)^Profiles:\s+(.+)$') { $Matches[1] -split ',' | ForEach-Object { $_.Trim() } }
}
# A block rule wins over an allow rule, so only count block rules for the current network type.
$blocked = @($forDans | Where-Object {
        $_ -match '(?m)^Action:\s+Block' -and @(Get-RuleProfile $_ | Where-Object { $networkTypes -contains $_ }).Count -gt 0
    })
$allowedProfiles = @($forDans | Where-Object { $_ -match '(?m)^Action:\s+Allow' } | ForEach-Object { Get-RuleProfile $_ })
$uncovered = @($networkTypes | Where-Object { $allowedProfiles -notcontains $_ })

if ($rules.Count -eq 0) {
    Write-Host ''
    Write-Host 'If other devices cannot connect, allow DANS through Windows Firewall (see README.md).' -ForegroundColor Yellow
}
elseif ($blocked.Count -gt 0) {
    Write-Host ''
    Write-Host 'A Windows Firewall rule BLOCKS DANS (probably "Cancel" was clicked in the Windows Firewall pop-up).' -ForegroundColor Red
    Write-Host 'Open "Windows Defender Firewall with Advanced Security" > Inbound Rules, and delete the blocking "Dans.Api" rule.' -ForegroundColor Red
}
elseif ($uncovered.Count -gt 0) {
    Write-Host ''
    Write-Host "Windows Firewall will block other devices on this $($uncovered -join '/') network. Do this once:" -ForegroundColor Yellow
    Write-Host '  open PowerShell with "Run as administrator" and run' -ForegroundColor Yellow
    Write-Host "  $addRuleCommand" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Green
Write-Host ' DANS presentation mode' -ForegroundColor Green
Write-Host "   On this computer : https://localhost:$Port"
if ($lanAddresses.Count -eq 0) {
    Write-Host '   Other devices    : no network connection found. Connect to the Wi-Fi first.' -ForegroundColor Red
}
foreach ($ip in $lanAddresses) {
    Write-Host "   Other devices    : https://${ip}:$Port" -ForegroundColor Yellow
}
Write-Host '   - The other device must be on the same Wi-Fi or network.'
Write-Host '   - Type the whole address, including https:// (without it the page stays empty).'
Write-Host '   - The browser warns about the certificate: choose Advanced > Proceed / Continue.'
Write-Host '   - Demo accounts: use the buttons on the Sign in page (password Demo@123).'
Write-Host '   Press Ctrl+C to stop.'
Write-Host '==============================================================' -ForegroundColor Green
Write-Host ''

# ---------- 6. Start the API (settings passed as environment variables, restored afterwards) ----------
$settings = @{
    'ASPNETCORE_ENVIRONMENT' = 'Development'
    'ASPNETCORE_URLS'        = "https://*:$Port;http://localhost:$httpPort"
    'AllowedHosts'           = ($hostNames -join ';')
}
$previous = @{}
foreach ($name in $settings.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
}
Push-Location $apiDir
try {
    dotnet run --no-launch-profile
}
finally {
    Pop-Location
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    Write-Host 'DANS stopped.'
}
