@echo off
rem PKOS - open on this computer (local server http://localhost:5180)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\pkos-local-server.ps1"
if errorlevel 1 pause
