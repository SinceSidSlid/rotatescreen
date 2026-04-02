@echo off
cd /d "%~dp0"
:loop
echo Starting kiosk app...
call npx electron .
echo App exited, restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
