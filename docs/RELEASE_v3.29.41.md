# LOW v3.29.41 — integración de rigging 2D y bloque 3D

Estado: **publicada** el 21-ago-2026 (tag `v3.29.41`, instaladores armados por
`build.yml`). Nació como borrador de lo que debía entrar en la versión; se dejó
tal cual y solo se cambió el estado, así queda el registro de qué se prometió y
qué se verificó. Las pruebas marcadas con ⏳ abajo siguen pendientes: que la
versión esté publicada no las convierte en aprobadas.

## Rigging y animación 2D

- Armado cut-out real sobre `Scene.rig`: registrar piezas ya no inventa una
  anatomía ni una raíz por tamaño.
- Pivotes arrastrables y vínculo gráfico hijo→padre directamente en la mesa.
- Binding rígido explícito, jerarquía, FK, IK de dos huesos, límites, claves,
  Undo/Redo y persistencia sobre el documento canónico.
- Corrección de la capa interactiva del rig para que ocupe realmente el Viewer
  y reciba eventos del puntero.
- Arquitectura profesional v4 definida para slots, attachments, mallas, pesos,
  constraints ordenadas, controles, acciones y rigs de múltiples vistas, sin
  crear una escena o sistema paralelo.
- Fundamento v4 implementado: migración automática desde v3, bones separados
  del arte, slots/attachments/bindings, canales por propiedad, orden explícito
  de constraints, rechazo de ciclos y diagnóstico de referencias rotas. Un
  esqueleto puede existir y guardarse sin una pieza de arte obligatoria.
- Creación gráfica de huesos sobre la mesa: raíz por arrastre, continuidad de
  cadena desde una punta, selección de huesos sin arte, edición de geometría y
  Undo/Redo por gesto.
- Corregida la carga de SVG para que no borre el overlay interactivo del rig.

## Trabajo concurrente de Claude incluido en la rama

- `767f07e`: el dibujo sobre una superficie 3D permanece adherido a ella.
- `bcb8f08`: figuras planas con contorno/relleno y correcciones de raíz.
- `b474a19`: trazo exacto sobre superficie e informe STL coherente con la
  geometría exportada.

Estos cambios se conservan tal como fueron entregados. Su presencia en este
borrador no convierte una prueba pendiente en una validación aprobada.

## Verificación

- ✅ 120/120 pruebas del modelo 2D.
- ✅ Prueba interactiva en navegador de raíz→hijo, parenting automático,
  edición de longitud, Undo y Redo visibles en el overlay.
- ✅ E2E previo de registrar piezas, mover pivote, vincular y Undo.
- ✅ Compilación TypeScript sin errores.
- ✅ Build de producción del renderer híbrido.
- ✅ Prueba de plano guía del bloque 3D concurrente en los cinco casos.
- Prueba manual 2D: armar, posar, reproducir, Undo/Redo, guardar/reabrir y
  comparar Viewer/export: aprobada para el commit 2D `0d0a85c`; debe repetirse
  sobre el ejecutable final.
- ⏳ Prueba manual de los tres flujos 3D descritos arriba.
- ✅ Fuentes de versión sincronizadas en `3.29.41`: `VERSION`, `LOW_VERSION` en
  `main.py`, `AppVersion` en `low_installer.iss` (venía quedado en `3.22.17`) y
  el paquete híbrido (`package.json` y `package-lock.json`, que declaraban
  `3.29.39`). Los scripts de `ui/index.html` quedaron sellados con `?v=3.29.41`
  (`tools/stamp_version.py`): sin eso el WebView puede seguir ejecutando el
  `app.js` anterior después de actualizar.
- ✅ Tag `v3.29.41` e interfaz informan `3.29.41`. El **ejecutable** lo produce
  `build.yml` a partir del tag y deriva su versión de ahí; confirmarlo sobre el
  instalador publicado sigue siendo parte de la prueba manual pendiente.
- ✅ 120/120 pruebas del modelo 2D corridas de nuevo sobre este mismo árbol
  antes de taggear.

El build advierte que el chunk principal supera 500 kB. No bloquea esta
integración, pero debe abordarse con división de código antes de sumar editores
pesados de malla y Schematic.
