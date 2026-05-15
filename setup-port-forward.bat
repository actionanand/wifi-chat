@echo off
:: WiFi Chat — Port Forwarding Setup (auto-elevates to Admin)
:: Double-click this file or run from any command prompt.

:: Check for admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && powershell -ExecutionPolicy Bypass -File \"%~dp0setup-port-forward.ps1\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0setup-port-forward.ps1"
pause
