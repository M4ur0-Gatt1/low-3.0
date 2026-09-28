# LOW 3.29.75 — Rigging verificable

Esta versión reorganiza el rigging 2D alrededor de un flujo explícito y comprobable:

1. **Construir:** importar o dibujar las piezas, crear el alambre, ajustar articulaciones y repartir el dibujo.
2. **Probar:** posar temporalmente sin crear claves ni modificar la geometría neutra. Escape restaura la pose.
3. **Animar:** grabar poses y claves solamente cuando el rig ya tiene esqueleto y arte vinculado.

## Cambios principales

- Nuevo modo **Probar**, separado de Construir y Animar.
- Diagnóstico visible de preparación: huesos, piezas vinculadas y piezas sueltas.
- Animar queda deshabilitado hasta que exista una vinculación real entre esqueleto y dibujo.
- Huesos cónicos inspirados en la legibilidad de Moho, con articulaciones y jerarquía más claras.
- Las articulaciones compartidas se editan como una sola unión y los hijos no se desprenden al posar.
- Transformaciones 2D basadas en matrices para evitar movimiento invertido después de rotar.
- Selección por marco con comportamiento profesional de cruce y contención.
- Correcciones de entrada para tableta, redimensionado, cámara, scrub de línea de tiempo y turntable.
- Biblia de producción y controles automáticos de calidad integrados al pipeline.

## Verificación

- Suite del modelo 2D y rigging.
- Contratos estáticos de Escape, rueda, modos y entrada de tableta.
- Validación sintáctica de JavaScript y Python.
- Compilación del ejecutable Windows desde una carpeta limpia.

## Alcance honesto

LOW 3.29.75 consolida el rigging rígido por piezas (cut-out). La deformación por malla con pesos, Smart Bones y controles faciales avanzados continúan en la hoja de ruta; no se presentan como terminados en esta versión.
