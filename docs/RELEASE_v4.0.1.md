# LOW v4.0.1 — Motion capture estable y documentos limpios

Esta versión corrige regresiones críticas del módulo 2D y convierte el flujo de
video en una herramienta local verificable, separada del rigging cut-out.

## Motion capture y rotoscopía

- Detección corporal local sobre video, ejecutada fuera del hilo de interfaz.
- Máscaras semánticas del actor y siluetas utilizables como guía de rotoscopía.
- Protección contra cuadros blancos: una extracción inválida no reemplaza el
  contenido del nivel.
- Contactos de pies más estables y reducción de vibración entre cuadros.
- Retargeting con claves semánticas completas y transferencia reversible al rig.
- Estado, panel, video, máscaras y guías de motion capture independientes del
  panel de cut-out.

## Rigging y animación

- `Suprimir` distingue correctamente entre un objeto artístico y un hueso
  seleccionado, y permite borrar ambos sin afectar el otro sistema.
- La selección de un hueso vinculado conserva su contexto de rigging.
- Curvas por propiedad para posición, giro y escala sin volver a igualar sus
  tangentes al editar una pose.
- Copiar y pegar el timing de un tramo sin copiar ni deformar sus valores.
- Timeline, X-sheet y editor de funciones comparten la misma definición de
  segmento entre claves.

## Documentos y estabilidad

- Un documento nuevo empieza realmente vacío: no hereda manchas, cuadros,
  máscaras, videos, guías ni estado de captura de otro archivo.
- El panel de motion capture se abre y se cierra sin cambiar el modo cut-out.
- Restauración consistente de la interfaz al crear, abrir o reemplazar un
  documento.

## Verificación

- 262 pruebas del modelo 2D.
- Contratos automáticos de Escape, rueda, modos, rig, vectores y tableta.
- Prueba E2E en Chromium real para separación de paneles, reinicio de documento,
  selección y borrado independiente de objetos y huesos.
