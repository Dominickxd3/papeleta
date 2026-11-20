# Publica la pagina Horarios en el servidor SIN reemplazar backend\server.js:
# descarga los archivos nuevos desde GitHub y agrega a server.js solo las 4
# lineas de Horarios (respetando los cambios propios del servidor).
# Ejecutar en el servidor, PowerShell como administrador.
param(
  [string]$Dest = 'C:\inetpub\wwwroot\SistemasPapeletas',
  [string]$Commit = '15b73f1',
  [string]$Servicio = 'papeletasapi.exe',
  [switch]$SinReiniciar
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$raw = "https://raw.githubusercontent.com/Dominickxd3/papeleta/$Commit"
$web = New-Object Net.WebClient

$serverJs = Join-Path $Dest 'backend\server.js'
$bytes = [IO.File]::ReadAllBytes($serverJs)
$conBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
$txt = [IO.File]::ReadAllText($serverJs)
$nl = if ($txt.Contains("`r`n")) { "`r`n" } else { "`n" }

# 1. Preparar el cambio de server.js (sin escribir todavia)
$nuevoTxt = $txt
if ($txt -notmatch 'registerHorariosRoutes') {
  $cambios = @(
    @{ p = "(?m)^[ \t]*const \{ registerMonitoringRoutes \} = require\('\./routes/monitoring\.routes'\);[ \t]*(?=\r?$)";
       i = "$nl" + "const { registerHorariosRoutes } = require('./routes/horarios.routes');" },
    @{ p = "(?m)^[ \t]*registerSystemRoutes\(app[^\r\n]*\);[ \t]*(?=\r?$)";
       i = "$nl$nl// HORARIOS DEL PERSONAL$nl" + "registerHorariosRoutes(app, { getPool: () => pool, sql });" },
    @{ p = "(?m)^[ \t]*trabajadores: path\.join\(frontendRootDir, 'HTML', 'trabajadores\.html'\),[ \t]*(?=\r?$)";
       i = "$nl  horarios: path.join(frontendRootDir, 'HTML', 'horarios.html')," },
    @{ p = "(?m)^[ \t]*'trabajadores\.html': '/trabajadores',[ \t]*(?=\r?$)";
       i = "$nl    'horarios.html': '/horarios'," }
  )
  $puntos = @()
  foreach ($c in $cambios) {
    $m = [regex]::Matches($txt, $c.p)
    if ($m.Count -ne 1) { throw "No encuentro un punto unico para insertar en server.js (patron: $($c.p)). No se cambio nada." }
    $puntos += [pscustomobject]@{ pos = $m[0].Index + $m[0].Length; ins = $c.i }
  }
  foreach ($pt in ($puntos | Sort-Object pos -Descending)) {
    $nuevoTxt = $nuevoTxt.Insert($pt.pos, $pt.ins)
  }
}

# 2. Respaldo
$resp = Join-Path $Dest ('_respaldo_horarios_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
$tocar = 'backend/server.js','backend/routes/horarios.routes.js','backend/sql/20261120_vw_Web_Horario_Personal.sql','backend/sql/20261120_areas_jefes_produccion_desarrollo.sql','HTML/horarios.html','js/controllers/horarios.controller.js','js/sidebar.js','css/pages/horarios.page.css'
foreach ($f in $tocar) {
  $src = Join-Path $Dest ($f -replace '/','\')
  if (Test-Path $src) {
    $b = Join-Path $resp ($f -replace '/','\')
    New-Item -ItemType Directory -Force (Split-Path $b) | Out-Null
    Copy-Item $src $b
  }
}
Write-Host "Respaldo en: $resp"

# 3. Descargar archivos nuevos (todo menos server.js)
foreach ($f in $tocar | Where-Object { $_ -ne 'backend/server.js' }) {
  $dst = Join-Path $Dest ($f -replace '/','\')
  New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  $web.DownloadFile("$raw/$f", $dst)
  Write-Host "Actualizado: $f"
}

# 4. Escribir server.js y validar sintaxis
if ($nuevoTxt -ne $txt) {
  [IO.File]::WriteAllText($serverJs, $nuevoTxt, (New-Object Text.UTF8Encoding($conBom)))
  Write-Host 'Actualizado: backend/server.js (4 lineas agregadas)'
} else {
  Write-Host 'backend/server.js ya tenia Horarios; no se cambio.'
}
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = 'node' }
& $node --check $serverJs
if ($LASTEXITCODE -ne 0) {
  Copy-Item (Join-Path $resp 'backend\server.js') $serverJs -Force
  throw 'server.js quedo con error de sintaxis; se restauro el respaldo. No se reinicio el servicio.'
}

# 5. Reiniciar
if (-not $SinReiniciar) {
  Restart-Service -Name $Servicio -Force
  Start-Sleep -Seconds 5
  Get-Service -Name $Servicio | Select-Object Name, Status
}
Write-Host 'Listo. Abre https://papeletasgp.duckdns.org/SistemasPapeletas/horarios (Ctrl+F5).'
