# LOW en la Microsoft Store

El modelo es el de Krita: **el mismo programa, gratis en GitHub y pago en la Microsoft Store** (la licencia MIT lo permite). Quien lo compra en la Store recibe actualizaciones automáticas y un paquete firmado por Microsoft, sin el aviso de «editor desconocido». Quien no puede o no quiere pagar lo baja gratis desde los [releases](https://github.com/M4ur0-Gatt1/low-3.0/releases).

## Cómo se arma

- `packaging/msix/AppxManifest.template.xml`: el manifiesto del paquete. Es una app de escritorio completa (`runFullTrust`), que abre los `.low` y anda en Windows 10 1809 o más nuevo.
- `packaging/msix/armar_msix.py`: arma la carpeta del paquete con `LOW.exe`, el manifiesto con la identidad de Partner Center y los logos sacados de `low.ico`.
- `packaging/msix/empaquetar.ps1`: la empaca con `makeappx` del Windows SDK. Deja:
  - `LOW-<versión>.msix` **sin firmar**: es el que se sube a la Store, que lo firma al publicar.
  - `LOW-<versión>-prueba.msix` y `LOW-prueba.cer`: una copia firmada con un certificado de prueba, para instalarla en una PC antes de mandarla.
- El build (`.github/workflows/build.yml`) lo hace en cada release y lo deja como **artefacto del run**. No va al release de GitHub, porque la versión de GitHub es el instalador de siempre.
- `.github/workflows/msix.yml` lo rehace desde el `LOW.exe` de un release ya publicado, sin compilar. Se lanza a mano desde Actions → msix → Run workflow.
- `tools/check_msix_manifest.py` controla el paquete en cualquier sistema.

### Lo que cambia en la app empaquetada

- No lee `HKCU\Software\LOW\Version`, que es la versión que anota el instalador de GitHub. La de la Store la actualiza la Store, y con las dos instaladas en la misma PC el aviso de «se instaló una versión más nueva» saltaba sin motivo (`empaquetado_msix()` en `main.py`).
- La configuración que escribe en `%APPDATA%\LOW` Windows la guarda aparte, dentro del paquete. Las dos versiones no se pisan las preferencias.
- Los proyectos siguen en `Documentos\LOW Proyectos`, compartidos entre las dos.

## Lo que hacés vos (una vez)

1. **Cuenta de desarrollador** en [Partner Center](https://partner.microsoft.com/dashboard). Si ya la tenés para Trazo, es la misma.
2. **Crear la app y reservar el nombre** (Apps and games → New product → MSIX or PWA app). «LOW» solo puede estar tomado; por ejemplo «LOW Studio».
3. En **Product management → Product identity** aparecen tres valores. Cargalos en GitHub como **variables** (no secretos), en Settings → Secrets and variables → Actions → Variables:

   | Variable | Lo que dice Partner Center |
   |---|---|
   | `LOW_MSIX_IDENTITY_NAME` | Package/Identity/Name |
   | `LOW_MSIX_PUBLISHER` | Package/Identity/Publisher (empieza con `CN=`) |
   | `LOW_MSIX_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |
   | `LOW_MSIX_DISPLAY_NAME` | el nombre que reservaste |

   Sin estas variables el paquete sale con una identidad de **prueba**, que sirve para instalarlo en tu PC pero no para la Store.
4. Con las variables cargadas, lanzá **Actions → msix → Run workflow** con el último tag, o esperá al próximo release. Del artefacto `LOW-msix-vX.Y.Z` subís `LOW-X.Y.Z.msix` en la entrega (**Packages**).

## La entrega en la Store

- **Precio**: el que quieras. Se puede dar una prueba gratis (por ejemplo, 7 días) con el mismo paquete.
- **Funciones restringidas**: la Store pide justificar `runFullTrust`. Un texto posible: *LOW is a full desktop application (Python + WebView2) for drawing, 2D animation and compositing. It needs full trust to read and write the user's project files, run its local rendering and export tools (ffmpeg), and host its interface in WebView2.*
- **Política de privacidad**: https://github.com/M4ur0-Gatt1/low-3.0/blob/main/docs/CODE_SIGNING_POLICY.md#privacy-policy
- **Capturas**: al menos una de 1366×768 o más.
- **Clasificación por edades**: el cuestionario de IARC.
- **Atención con el agente de IA**: LOW puede ejecutar comandos en la PC cuando el usuario se lo pide desde el chat, con su propia clave de un proveedor de IA. Conviene decirlo en la descripción y en las notas para la certificación, porque los revisores miran con cuidado las apps que ejecutan código.

## Probar el paquete en tu PC antes de mandarlo

1. Bajá el artefacto `LOW-msix-vX.Y.Z` del run (Actions → el run → Artifacts) y descomprimilo.
2. Confiá el certificado de prueba. Es un cambio de seguridad de Windows: hacelo vos, en PowerShell **como administrador**:

   ```powershell
   Import-Certificate -FilePath .\LOW-prueba.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
   ```

3. Doble clic en `LOW-X.Y.Z-prueba.msix` → Instalar. Aparece en el menú Inicio como cualquier app de la Store.
4. Al terminar, desinstalala (Configuración → Aplicaciones) y sacá el certificado:

   ```powershell
   Get-ChildItem Cert:\LocalMachine\TrustedPeople | Where-Object Subject -eq "CN=LOW Prueba" | Remove-Item
   ```

   Si cargaste las variables de Partner Center, el certificado se llama como tu `LOW_MSIX_PUBLISHER`.
