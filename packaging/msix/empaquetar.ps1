# Empaca la carpeta que arma armar_msix.py en un .msix (Windows SDK: makeappx).
#
#   pwsh packaging/msix/empaquetar.ps1 -Carpeta build/msix -Version 3.52.0 -Salida Output-msix
#
# Deja en -Salida:
#   LOW-<ver>.msix          SIN FIRMAR: es el que se sube a Partner Center. La
#                           Store lo firma con su propio certificado al publicar.
#   LOW-<ver>-prueba.msix   firmado con un certificado de PRUEBA, para instalarlo
#                           en una PC antes de mandarlo a la Store.
#   LOW-prueba.cer          ese certificado: hay que confiarlo en la PC (como
#                           administrador) para que Windows deje instalar el de prueba.
#                           Ver docs/MICROSOFT_STORE.md
param(
  [Parameter(Mandatory = $true)][string]$Carpeta,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Salida
)
$ErrorActionPreference = "Stop"

function Herramienta($nombre) {
  $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  $h = Get-ChildItem $kits -Recurse -Filter $nombre -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\*" } | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $h) { throw "no encontré $nombre (Windows SDK)" }
  return $h.FullName
}
$makeappx = Herramienta "makeappx.exe"
$signtool = Herramienta "signtool.exe"

New-Item -ItemType Directory -Force $Salida | Out-Null
$msix = Join-Path $Salida "LOW-$Version.msix"
# makeappx valida el manifiesto contra el esquema: si algo está mal, falla acá
& $makeappx pack /d $Carpeta /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx falló" }

# ── copia firmada con un certificado de prueba (el Publisher tiene que coincidir) ──
[xml]$m = Get-Content (Join-Path $Carpeta "AppxManifest.xml") -Raw -Encoding utf8
$publisher = $m.Package.Identity.Publisher
$cert = New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature `
  -FriendlyName "LOW (prueba del paquete MSIX)" -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
try {
  $pfx = Join-Path $env:RUNNER_TEMP "low-prueba.pfx"
  if (-not $env:RUNNER_TEMP) { $pfx = Join-Path $env:TEMP "low-prueba.pfx" }
  $clave = ConvertTo-SecureString -String ([guid]::NewGuid().ToString()) -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $clave | Out-Null
  Export-Certificate -Cert $cert -FilePath (Join-Path $Salida "LOW-prueba.cer") | Out-Null
  $prueba = Join-Path $Salida "LOW-$Version-prueba.msix"
  Copy-Item $msix $prueba -Force
  $plano = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
  & $signtool sign /fd SHA256 /f $pfx /p $plano $prueba
  if ($LASTEXITCODE -ne 0) { throw "signtool falló al firmar la copia de prueba" }
  Remove-Item $pfx -Force
} finally {
  Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force -ErrorAction SilentlyContinue
}
Get-ChildItem $Salida | Select-Object Name, Length | Format-Table -AutoSize
