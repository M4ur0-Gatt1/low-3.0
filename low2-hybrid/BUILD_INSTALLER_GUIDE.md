# 🚀 LOW 2.0 - Guía de Construcción del Instalador

## Requisitos Previos

### Software Necesario
- **Node.js** >= 18.0.0 (LTS recomendado)
- **npm** >= 9.0.0
- **Visual Studio 2022** con carga de trabajo "Desarrollo para el escritorio con C++"
- **CMake** >= 3.20
- **Git** para clonar el repositorio

### Dependencias de Windows
- Windows 10/11 SDK
- OpenGL 4.6 drivers (incluidos en drivers de GPU)
- [Opcional] Windows Performance Toolkit para profiling

## Paso 1: Clonar y Preparar el Proyecto

```bash
git clone https://github.com/tu-usuario/low2-hybrid.git
cd low2-hybrid
```

## Paso 2: Instalar Dependencias de Node.js

```bash
npm install
```

Esto instalará:
- Electron para la aplicación de escritorio
- React y dependencias de UI
- TypeScript y herramientas de build
- node-addon-api para el puente nativo

## Paso 3: Configurar el Entorno de Build Nativo

### 3.1 Generar Proyectos de Visual Studio

```bash
cmake -B build/native -S native -G "Visual Studio 17 2022" -A x64
```

### 3.2 Compilar Motores Nativos

```bash
cmake --build build/native --config Release
```

Esto compilará:
- `low-native-bridge.node` - Módulo Node-API
- Librerías estáticas de motores (Surface, Stroke, Render, Input)

### 3.3 Verificar Build Nativo

El archivo compilado debe aparecer en:
```
native/build/Release/low-native-bridge.node
```

## Paso 4: Build Completo de la Aplicación

### 4.1 Build de Desarrollo (con hot-reload)

```bash
npm run dev
```

Esto inicia:
- Servidor Vite para la UI web
- Watcher de CMake para cambios nativos
- Electron en modo desarrollo

### 4.2 Build de Producción

```bash
npm run build
```

Este comando ejecuta:
1. `npm run build:native` - Compila módulos nativos en Release
2. `tsc` - Compila TypeScript a JavaScript
3. `npm run build:renderer` - Empaqueta assets con Vite

## Paso 5: Crear el Instalador

### 5.1 Generar Instalador NSIS

```bash
npm run package
```

o específicamente para el instalador:

```bash
npm run installer
```

### 5.2 Ubicación del Instalador

El instalador se generará en:
```
dist/LOW-2.0-Setup.exe
```

### 5.3 Personalización del Instalador

El instalador incluye:
- ✅ Acceso directo en escritorio
- ✅ Entrada en menú de inicio
- ✅ Desinstalador registrado en Windows
- ✅ Selector de directorio de instalación
- ✅ Detección de requisitos previos

## Paso 6: Distribución

### Archivos Generados

Después del build completo, encontrarás:

```
dist/
├── LOW-2.0-Setup.exe          # Instalador NSIS (~150-200 MB)
├── win-unpacked/              # Versión portable sin instalar
│   ├── LOW 2.0.exe
│   ├── resources/
│   │   ├── app.asar           # Código de la aplicación
│   │   └── native/            # Módulos nativos compilados
│   └── ffmpeg.dll             # Codecs de video
└── builder-effective-config.yaml
```

### Requisitos del Sistema para Usuarios Finales

**Mínimos:**
- Windows 10 64-bit (versión 1903 o superior)
- 8 GB RAM
- GPU con soporte OpenGL 4.6
- 2 GB espacio en disco
- .NET Framework 4.7.2 (se instala automáticamente si falta)

**Recomendados:**
- Windows 11 64-bit
- 16+ GB RAM
- GPU dedicada (NVIDIA GTX 1060 / AMD RX 580 o superior)
- SSD con 5 GB libres
- Tableta gráfica (Wacom, Huion, XP-Pen)
- 3Dconnexion SpaceMouse (opcional)

## Solución de Problemas Comunes

### Error: "module not found: low-native-bridge"

**Causa:** Los módulos nativos no se compilaron correctamente.

**Solución:**
```bash
# Limpiar build anterior
rm -rf build/native

# Regenerar proyectos
cmake -B build/native -S native -G "Visual Studio 17 2022" -A x64

# Recompile
cmake --build build/native --config Release

# Reinstalar dependencias de Node
npm rebuild
```

### Error: "OpenGL context creation failed"

**Causa:** Drivers de GPU desactualizados o hardware incompatible.

**Solución:**
1. Actualizar drivers de GPU (NVIDIA/AMD/Intel)
2. Verificar que la GPU soporte OpenGL 4.6
3. En laptops, asegurar que usa GPU dedicada (no integrada)

### Error: "node-gyp failed"

**Causa:** Herramientas de build de Python/VS incompletas.

**Solución:**
```bash
# Instalar herramientas de build globales
npm install --global windows-build-tools

# O manualmente:
# 1. Instalar Python 3.x desde python.org
# 2. En VS Installer, agregar "Desarrollo para el escritorio con C++"
```

### El instalador es demasiado grande (>300 MB)

**Optimizaciones:**
```json
// En package.json, ajustar configuración de build
"build": {
  "compression": "maximum",
  "removePackageScripts": true,
  "removePackageJson": false,
  "asarUnpack": ["**/*.node", "**/*.dll"]
}
```

## Build Automatizado (CI/CD)

### GitHub Actions Example

```yaml
name: Build LOW 2.0

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install Dependencies
      run: npm ci
    
    - name: Setup Visual Studio
      uses: microsoft/setup-msbuild@v1
    
    - name: Build Native Modules
      run: |
        cmake -B build/native -S native -G "Visual Studio 17 2022" -A x64
        cmake --build build/native --config Release
    
    - name: Build Application
      run: npm run build
    
    - name: Create Installer
      run: npm run package
    
    - name: Upload Installer
      uses: actions/upload-artifact@v3
      with:
        name: LOW-2.0-Installer
        path: dist/LOW-2.0-Setup.exe
```

## Verificación Post-Instalación

Después de instalar LOW 2.0:

1. **Verificar versión:**
   - Abrir LOW 2.0
   - Ir a Help > About
   - Confirmar versión 2.0.x

2. **Testear motores nativos:**
   - Abrir consola de desarrollador (F12)
   - Debería mostrar: `[LOW 2.0] Motores nativos inicializados correctamente`

3. **Testear tableta gráfica:**
   - Dibujar con presión variable
   - Verificar que el grosor cambia con la presión

4. **Testear rendimiento:**
   - Crear 1000+ trazos
   - FPS debería mantenerse >30 en hardware recomendado

## Próximos Pasos

Una vez construido exitosamente:

1. 📝 Documentar características específicas en README.md
2. 🎨 Crear assets de marketing (iconos, screenshots)
3. 🌐 Publicar en sitio web oficial
4. 📢 Anunciar en comunidades de diseño/arte digital
5. 🔄 Establecer ciclo de actualizaciones automáticas

---

**Soporte:** Para problemas de build, abrir issue en GitHub con:
- Logs completos de compilación
- Versión de Node.js, npm, CMake, VS
- Especificaciones del sistema
- Versión de Windows exacta
