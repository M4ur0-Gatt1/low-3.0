; Instalador de LOW — editor de diseño/animación con agente IA
; Compilar: ISCC.exe low_installer.iss

#define AppName "LOW"
; La versión se puede pasar por línea de comandos: ISCC /DAppVersion=3.5.0
; (el workflow la deriva del tag). El default acá es solo para builds manuales
; y debe coincidir con LOW_VERSION en main.py.
#ifndef AppVersion
  #define AppVersion "3.14.0"
#endif
#define AppExe "LOW.exe"
#define AppExt ".low"
#define AppProgId "LOW.Escena.1"

[Setup]
AppId={{B7E3D9A4-2C51-4F8E-A6B0-3D94E71C5F28}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Mauro Gatti · Tropa Circa
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; instalaciÃ³n por usuario: no pide permisos de administrador
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=LOWSetup-{#AppVersion}
SetupIconFile=low.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; La asociación de .low cambia el registro: Windows tiene que enterarse para
; refrescar los iconos del Explorador sin reiniciar sesión.
ChangesAssociations=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
; El icono de los documentos .low se instala aparte del ejecutable: el
; Explorador lo lee del archivo, y si viviera dentro del exe cada actualizacion
; invalidaria la cache de iconos de Windows.
Source: "low_doc.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; Asociación de .low POR USUARIO (HKCU): el instalador corre sin permisos de
; administrador (PrivilegesRequired=lowest), así que no puede escribir en HKLM.
; No se toca ningún otro tipo de archivo.
; LA VERSION QUE SE ACABA DE INSTALAR. El programa la compara con la que trae
; compilada adentro: si el registro dice una MAS NUEVA que la que esta
; corriendo, es que se instalo con LOW abierto y esa ventana quedo con codigo
; viejo. Antes eso se adivinaba por la fecha del .exe, y no funcionaba: el
; instalador conserva la marca de tiempo del build —el runner compila en UTC—
; asi que el archivo parecia estar horas en el FUTURO y el aviso saltaba en
; todos los arranques. Esto es exacto y no depende de relojes.
Root: HKCU; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#AppExt}"; ValueType: string; ValueData: "{#AppProgId}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\{#AppProgId}"; ValueType: string; ValueData: "Escena de LOW"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#AppProgId}\DefaultIcon"; ValueType: string; ValueData: "{app}\low_doc.ico"
Root: HKCU; Subkey: "Software\Classes\{#AppProgId}\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
; Que aparezca en «Abrir con» y en la lista de programas del panel de control
Root: HKCU; Subkey: "Software\Classes\Applications\{#AppExe}\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueName: "{#AppExt}"; ValueType: string; ValueData: ""
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#AppExe}"; ValueType: string; ValueData: "{app}\{#AppExe}"; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; la config y el historial quedan en %APPDATA%\LOW por si reinstala;
; solo se borra lo instalado
Type: filesandordirs; Name: "{app}"
