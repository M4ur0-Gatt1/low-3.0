# LOW v3.29.65 — Documentos 2D claros y sin estado heredado

## Cambios principales

- Un documento nuevo comienza realmente vacío: no hereda rig, cámara, selección, historial, papel cebolla ni autoguardado del documento anterior.
- El menú Archivo adopta una sola lógica de documento: Nuevo, Abrir, Guardar, Guardar como, Cerrar y Mover a la papelera.
- Cerrar documento descarga su estado; salir del módulo 2D solamente oculta el espacio de trabajo para volver después.
- Eliminar mueve el archivo a `.low-trash` dentro del proyecto, en lugar de borrarlo definitivamente.
- La papelera rechaza cualquier ruta que esté fuera del proyecto abierto.
- Los atajos `Ctrl+N`, `Ctrl+O`, `Ctrl+S` y `Ctrl+Shift+S` actúan sobre el documento 2D y ya no sobre el editor de código que está detrás.

## Comprobaciones

- Modelo de animación 2D: 153/153 pruebas.
- Sintaxis JavaScript y Python verificada.
- Papelera probada con traslado recuperable y bloqueo de rutas externas.

## Reversión

La versión anterior permanece disponible como `v3.29.64`.
