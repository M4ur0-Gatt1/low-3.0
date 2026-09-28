# LOW v4.33.0 — Acciones, poses y articulaciones

- Seleccionar un dibujo ya no crea una edición fantasma ni agrega pasos de deshacer durante el guardado diferido.
- Las acciones permiten elegir un hueso o dial conductor desde el panel. Los vínculos rotos tienen avisos y ya no rompen el panel al borrar un dial.
- Nuevo bloque desplegable para grabar inicio y extremo y previsualizar la mezcla sin escribir claves. Escape vuelve a la escena.
- Diagnóstico de referencias inexistentes y dependencias circulares entre acciones.
- Se amplió la puerta de calidad con recorridos de controles, color y papelera.

El recorrido de articulaciones pasó en LOW nativo: corte, pose durante arrastre, pesos, correctivos, deshacer/rehacer y guardado/reapertura de un archivo real con exportación coincidente. El flujo nuevo de poses pasó las comprobaciones de navegador; sigue pendiente su revisión artística con tableta. Los correctivos de malla conservan su editor y hueso conductor dedicado.

Validación previa a publicación: 54 comprobaciones locales de la puerta CI aprobadas, contratos críticos 2D y compilación de sintaxis Python aprobados.
