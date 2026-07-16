@echo off
cd /d "%~dp0"
echo Starting Sovereign Ledger Backup...
npm run ledger:backup
echo Backup Completed.
pause
