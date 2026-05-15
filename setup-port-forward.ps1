<#
.SYNOPSIS
    Sets up Windows port forwarding so LAN devices can reach WiFi Chat running in WSL2.
.DESCRIPTION
    Must be run as Administrator.
    Forwards port 3000 (web) from Windows to WSL2.
    Also adds a firewall rule.
.NOTES
    Run: powershell -ExecutionPolicy Bypass -File setup-port-forward.ps1
    To remove: powershell -ExecutionPolicy Bypass -File setup-port-forward.ps1 -Remove
#>
param(
    [switch]$Remove
)

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "`n  ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> 'Run as administrator' -> re-run this script.`n" -ForegroundColor Yellow
    exit 1
}

# Get WSL IP
$wslIP = (wsl hostname -I).Trim().Split(' ')[0]
if (-not $wslIP) {
    Write-Host "  ERROR: Could not detect WSL IP. Is WSL running?" -ForegroundColor Red
    exit 1
}

$webPort = 3000
$ruleName = "WiFiChat"

if ($Remove) {
    Write-Host "`n  Removing WiFi Chat port forwarding..." -ForegroundColor Cyan
    netsh interface portproxy delete v4tov4 listenport=$webPort listenaddress=0.0.0.0 2>$null | Out-Null
    netsh advfirewall firewall delete rule name="$ruleName" 2>$null | Out-Null
    Write-Host "  Done! All WiFi Chat forwarding rules removed.`n" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host "     WiFi Chat - WSL2 Port Forwarding Setup    " -ForegroundColor Cyan
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  WSL2 IP detected: $wslIP" -ForegroundColor Yellow
Write-Host ""

# Clear old rule first
netsh interface portproxy delete v4tov4 listenport=$webPort listenaddress=0.0.0.0 2>$null | Out-Null

# Add port forwarding
Write-Host "  Setting up port forwarding..." -ForegroundColor Cyan
netsh interface portproxy add v4tov4 listenport=$webPort listenaddress=0.0.0.0 connectport=$webPort connectaddress=$wslIP | Out-Null

# Add firewall rule (remove old first)
netsh advfirewall firewall delete rule name="$ruleName" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$webPort | Out-Null

# Get Windows IP
$winIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Docker|Hyper-V' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  Port forwarding active!" -ForegroundColor Green
Write-Host ""
Write-Host "  Windows IP (share this): $winIP" -ForegroundColor White
Write-Host "  WiFi Chat -> http://${winIP}:${webPort}" -ForegroundColor White
Write-Host ""
Write-Host "  Now run 'npm start' in WSL to start WiFi Chat." -ForegroundColor Yellow
Write-Host "  To remove forwarding later: .\setup-port-forward.ps1 -Remove" -ForegroundColor DarkGray
Write-Host ""

# Show current forwarding table
Write-Host "  Current port forwarding rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4
Write-Host ""
