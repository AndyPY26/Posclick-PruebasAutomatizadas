#requires -Version 5.1
<#
Sincroniza este repo con pos4-dev:/home/sistemas/POS4/pycca-dockerized-solution/e2e
Usa tar sobre ssh (equivalente funcional a rsync para sobrescribir archivos cambiados/nuevos).
No borra archivos que ya no existan localmente.

Uso:
    .\sync.ps1              # sincroniza
    .\sync.ps1 -DryRun      # lista lo que enviaria
#>
param(
    [switch]$DryRun,
    [string]$RemoteHost = 'pos4-dev',
    [string]$RemoteDir  = '/home/sistemas/POS4/pycca-dockerized-solution/e2e'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$excludes = @(
    '--exclude=node_modules',
    '--exclude=.git',
    '--exclude=evidencias',
    '--exclude=playwright-report',
    '--exclude=test-results',
    '--exclude=.playwright-mcp',
    '--exclude=.DS_Store',
    '--exclude=sync.ps1',
    '--exclude=sync.bat'
)

if ($DryRun) {
    Write-Host "[DRY-RUN] Archivos que se enviarian a ${RemoteHost}:${RemoteDir}" -ForegroundColor Yellow
    & tar @excludes -cvf NUL .
    exit $LASTEXITCODE
}

Write-Host "Sincronizando -> ${RemoteHost}:${RemoteDir}" -ForegroundColor Cyan

# tar local -> ssh remoto -> tar extrae en destino
$tarCmd = "tar $($excludes -join ' ') -cf - ."
cmd /c "$tarCmd | ssh $RemoteHost `"cd '$RemoteDir' && tar -xf - && echo OK`""

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: sincronizacion fallo (exit=$LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Hecho." -ForegroundColor Green
