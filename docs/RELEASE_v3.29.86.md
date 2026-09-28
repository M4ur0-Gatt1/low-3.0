# LOW v3.29.86

Versión de estabilización del módulo 2D orientada a evitar regresiones en los
gestos de transformación y completar el recorrido inicial de rigging.

## Cambios

- El lienzo nuevo usa 1920 × 1080 por defecto.
- Suprimir elimina objetos seleccionados y, en Construir, el hueso seleccionado.
- La plantilla humana completa incorpora clavículas/hombros y conserva la
  jerarquía columna → hombro → brazo → antebrazo → mano.
- Ayuda incluye un personaje completo de dieciocho piezas visibles y vinculadas.
- La escala usa una única transformación matricial para rectángulos, trazos,
  texto, imágenes y grupos. Escalar después de rotar ya no reescribe la forma ni
  cambia los ejes del gesto.
- Un `pointercancel` restaura el estado anterior en rotación y escala.
- La prueba E2E cubre personaje, hombros, borrado contextual, Full HD y el flujo
  real de rotar y escalar sin alterar la geometría SVG.

## Verificación

- 220 pruebas del modelo 2D.
- Contratos críticos de interacción 2D.
- Validación de sintaxis Python.
- Recorrido Chromium obligatorio en CI antes de compilar artefactos.
