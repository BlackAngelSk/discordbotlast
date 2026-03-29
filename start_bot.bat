@echo off
setlocal

cd /d "%~dp0"

if not exist package.json (
  echo [launcher] package.json not found in %cd%
  exit /b 1
)

echo [launcher] Starting bot...
npm start

endlocal
