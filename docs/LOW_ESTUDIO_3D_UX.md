# Estudio 3D: interfaz y funcionamiento

El módulo que abre LOW desde `ui/estudio3d/index.html` usa ahora una barra de herramientas breve y un único inspector contextual. La pantalla inicial pasa de 58 botones a 22; las herramientas avanzadas siguen disponibles en **Más**.

- **Pincel**: presets, tamaño, opacidad y propiedades del trazo.
- **Guías**: primitivas, transparencia y superficies.
- **Escena**: objetos, agrupación y capas.
- **Tab**: concentración; **Esc** recupera la interfaz. La flecha superior vuelve a LOW.
- **Inicio** o el botón de encuadre centra la selección visible; sin selección, encuadra la escena.
- Un solo cubo de navegación y selector de vista; fondo claro u oscuro persistente.

Se corrigió la órbita desde vistas ortográficas: ahora cambia realmente de cámara a perspectiva. Editar campos ya no dispara borrar o deshacer sobre la escena. El historial actualiza el estado de los botones. Crear un proyecto nuevo limpia la ruta anterior para que Guardar no reutilice el archivo previo. El bucle de render omite el trabajo cuando el módulo está oculto.

## Verificación

El 9 de septiembre de 2026 pasó `tools/check_3d_studio_ui.js` contra el bundle integrado: Chromium a 1366 y 980 píxeles de ancho y WebView2 dentro del iframe real de LOW. Incluye trazos y navegación mediante eventos físicos, Undo/Redo, protección de campos, encuadre, concentración, acceso a herramientas, capas, exportación/importación JSON, tema y reinicio de proyecto sin ruta anterior. La prueba del reinicio también comprueba que el diálogo recibe clics por encima de la interfaz.

TypeScript y los cinco contratos de guide-plane pasaron. El guard del bundle se ejecuta en CI. No se verificaron en esta pasada una tableta física ni todos los formatos de exportación.

Para repetir con Chromium CDP en 9223 y servidor HTTP del repositorio en 8791:

```powershell
node tools/check_3d_studio_ui.js
$env:LOW_3D_WIDTH='980'
node tools/check_3d_studio_ui.js
```

Para una instancia de prueba de LOW con WebView2 CDP en 9225, usar `LOW_3D_CDP=http://127.0.0.1:9225` y `LOW_3D_EMBEDDED=1`. La prueba modifica la escena de esa instancia: no apuntarla a una sesión con trabajo sin guardar.

Las fuentes están en `low2-hybrid/modules/design`; `npm run build:renderer` genera el paquete que se copia a `ui/estudio3d`. No se modificó `ui/app.js` ni el arranque a cargo de Claude.
