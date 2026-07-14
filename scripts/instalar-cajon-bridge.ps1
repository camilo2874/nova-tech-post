# Instala el bridge del cajon para que arranque al encender Windows
# Ejecutar: powershell -ExecutionPolicy Bypass -File scripts\instalar-cajon-bridge.ps1

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'NOVA TECH Cajon Bridge.lnk'

# Buscar node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js no esta instalado. Instala Node.js desde https://nodejs.org"
    exit 1
}

$nodeExe = $nodeCmd.Source
$bridgeScript = Join-Path $projectRoot 'cajon-bridge-server.js'

if (-not (Test-Path $bridgeScript)) {
    Write-Error "No se encontro cajon-bridge-server.js en: $projectRoot"
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $nodeExe
$shortcut.Arguments = "`"$bridgeScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7  # Minimizado
$shortcut.Description = 'NOVA TECH POS - Bridge cajon monedero'
$shortcut.Save()

Write-Host "OK: Bridge instalado en inicio de Windows"
Write-Host "  Acceso directo: $shortcutPath"
Write-Host "  Proyecto: $projectRoot"
Write-Host ""
Write-Host "Inicia el bridge ahora con: npm run cajon-bridge"
