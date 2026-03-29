@echo off
setlocal enabledelayedexpansion

REM ==============================
REM GitHub Updater launcher (Windows)
REM ==============================

REM Folder where this BAT is located
set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

REM Python executable (change if needed)
set "PYTHON_EXE=python"

REM Detect start script first (must match the one that works when started manually)
set "START_BAT="
if exist "%BASE_DIR%start.bat" set "START_BAT=%BASE_DIR%start.bat"
if not defined START_BAT if exist "%BASE_DIR%start_bot.bat" set "START_BAT=%BASE_DIR%start_bot.bat"
if not defined START_BAT if exist "%BASE_DIR%bot.bat" set "START_BAT=%BASE_DIR%bot.bat"
if not defined START_BAT if exist "%BASE_DIR%discordbotlast\start.bat" set "START_BAT=%BASE_DIR%discordbotlast\start.bat"
if not defined START_BAT if exist "%BASE_DIR%discordbotlast\start_bot.bat" set "START_BAT=%BASE_DIR%discordbotlast\start_bot.bat"
if not defined START_BAT if exist "%BASE_DIR%discordbotlast\bot.bat" set "START_BAT=%BASE_DIR%discordbotlast\bot.bat"

REM Target app folder to install/update (directory of detected start script)
if defined START_BAT (
  for %%I in ("%START_BAT%") do set "TARGET_DIR=%%~dpI"
) else (
  set "TARGET_DIR=%BASE_DIR%"
)

REM Important: remove trailing backslash to avoid breaking quoted CLI args in Windows
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

REM Branch/commit to install from
set "REF=main"

REM Check interval in seconds for nonstop update watch
set "INTERVAL=60"

REM Force one bot instance by restarting each cycle (1=yes, 0=no)
set "RESTART_EACH_CYCLE=0"

REM Optional: process to stop before restart (node.exe is usually safer than .bat name)
set "STOP_PROCESS=node.exe"

if not defined START_BAT echo [launcher] Warning: No start.bat/start_bot.bat/bot.bat found. Auto-start disabled.

REM TLS options (set one)
REM 1) Recommended: provide CA bundle path
REM set "CACERT=--cacert C:\path\to\cacert.pem"

REM 2) Temporary fallback for certificate issues
set "TLS_FLAGS=--insecure"

REM Auto-compat: if updater.py does not support --insecure, remove TLS flag
"%PYTHON_EXE%" "%BASE_DIR%updater.py" --insecure --help >nul 2>nul
if errorlevel 1 (
  set "TLS_FLAGS="
  echo [launcher] Note: this updater.py does not support --insecure. Continuing without TLS_FLAGS.
)

echo [launcher] Starting updater...
echo [launcher] Target folder: %TARGET_DIR%
if defined START_BAT echo [launcher] Start script: %START_BAT%
if "%RESTART_EACH_CYCLE%"=="1" (
  "%PYTHON_EXE%" "%BASE_DIR%updater.py" %TLS_FLAGS% redo-loop ^
    --target "%TARGET_DIR%" ^
    --ref "%REF%" ^
    --interval "%INTERVAL%" ^
    --backup ^
    --stop-process "%STOP_PROCESS%" ^
    --start-bat "%START_BAT%" ^
    --start-on-launch ^
    --restart-each-cycle
) else (
  "%PYTHON_EXE%" "%BASE_DIR%updater.py" %TLS_FLAGS% redo-loop ^
    --target "%TARGET_DIR%" ^
    --ref "%REF%" ^
    --interval "%INTERVAL%" ^
    --backup ^
    --stop-process "%STOP_PROCESS%" ^
    --start-on-launch ^
    --start-bat "%START_BAT%"
)

if errorlevel 1 (
  echo [launcher] Updater failed with exit code !errorlevel!
) else (
  echo [launcher] Updater finished.
)

pause
endlocal
