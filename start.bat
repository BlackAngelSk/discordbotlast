@echo off
setlocal enabledelayedexpansion

title Start Bot with Auto-Updater
cls
cd /d %~dp0

REM ==============================
REM Bot Startup with Auto-Updater
REM ==============================

REM Folder where this BAT is located
set "BASE_DIR=%~dp0"

REM Python executable (change if needed)
set "PYTHON_EXE=python"

REM Check if updater.py exists in the self updater folder
set "UPDATER_PATH=%BASE_DIR%self updater\updater.py"
set "HAS_UPDATER=0"

if exist "%UPDATER_PATH%" (
  set "HAS_UPDATER=1"
  echo [launcher] Found updater.py - enabling auto-update mode
)

REM TLS options
set "TLS_FLAGS=--insecure"

REM Check if updater supports --insecure flag
if %HAS_UPDATER%==1 (
  "%PYTHON_EXE%" "%UPDATER_PATH%" --insecure --help >nul 2>nul
  if errorlevel 1 (
    set "TLS_FLAGS="
    echo [launcher] Note: updater.py does not support --insecure flag
  )
)

REM If updater is available, run it; otherwise just start the bot
if %HAS_UPDATER%==1 (
  echo [launcher] Starting with auto-update loop...
  "%PYTHON_EXE%" "%UPDATER_PATH%" %TLS_FLAGS% redo-loop ^
    --target "%BASE_DIR%" ^
    --ref "main" ^
    --interval "60" ^
    --backup ^
    --stop-process "node.exe" ^
    --start-on-launch ^
    --start-cmd "npm start"
  
  if errorlevel 1 (
    echo [launcher] Updater failed with exit code %errorlevel%
    echo [launcher] Falling back to direct bot startup...
    npm start
  )
) else (
  echo [launcher] Updater not found - starting bot directly
  npm start
)

pause
endlocal
