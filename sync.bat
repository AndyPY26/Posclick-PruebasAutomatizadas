@echo off
REM Sincroniza este repo con pos4-dev:/home/sistemas/POS4/pycca-dockerized-solution/e2e
REM Equivalente a rsync via tar+ssh (sobrescribe cambiados/nuevos; no borra).
REM Uso: sync.bat         -> sincroniza
REM      sync.bat dry     -> solo lista archivos

setlocal
cd /d "%~dp0"

set REMOTE_HOST=pos4-dev
set REMOTE_DIR=/home/sistemas/POS4/pycca-dockerized-solution/e2e

set EXCLUDES=--exclude=node_modules --exclude=.git --exclude=evidencias --exclude=playwright-report --exclude=test-results --exclude=.DS_Store --exclude=sync.ps1 --exclude=sync.bat

if /I "%~1"=="dry" (
    echo [DRY-RUN] Archivos que se enviarian a %REMOTE_HOST%:%REMOTE_DIR%
    tar %EXCLUDES% -cvf NUL .
    exit /b %ERRORLEVEL%
)

echo Sincronizando -^> %REMOTE_HOST%:%REMOTE_DIR%
tar %EXCLUDES% -cf - . | ssh %REMOTE_HOST% "cd '%REMOTE_DIR%' && tar -xf - && echo OK"
if errorlevel 1 (
    echo ERROR: sincronizacion fallo
    exit /b 1
)
echo Hecho.
endlocal
