param(
  [Parameter(Mandatory = $false)]
  [string]$Executable = "dist\LOW.exe",
  [int]$Seconds = 12
)

$resolved = Resolve-Path -LiteralPath $Executable -ErrorAction Stop
$process = $null
try {
  $process = Start-Process -FilePath $resolved.Path -WorkingDirectory (Split-Path $resolved.Path) -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds $Seconds
  if ($process.HasExited) {
    throw "LOW terminó durante el arranque (exit $($process.ExitCode))."
  }
  $size = (Get-Item -LiteralPath $resolved.Path).Length
  Write-Output "SMOKE EXE OK: PID $($process.Id), vivo tras ${Seconds}s, $size bytes"
}
finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  # PyInstaller one-file puede relanzar el ejecutable como proceso hijo. El
  # padre ya terminó, pero ese hijo conserva el archivo bloqueado. Cerramos
  # sólo instancias cuya ruta coincide exactamente con el artefacto probado.
  Get-CimInstance Win32_Process -Filter "Name = 'LOW.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $resolved.Path } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
