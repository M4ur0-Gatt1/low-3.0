# LOW v4.0.2 — Coloreo profesional multicuadro

Esta versión convierte el balde del módulo 2D en un sistema de coloreo por
niveles: puede seguir una zona entre dibujos, conserva la identidad de paleta y
se detiene cuando una coincidencia es ambigua en vez de introducir errores
silenciosos.

## Coloreo y animación

- Modos `Pintar`, `Sólo vacío`, `Recolorear` y `Borrar color`.
- Alcance sobre el cuadro actual, un rango de la X-sheet, la mesa de luz o el
  nivel completo.
- Seguimiento bidireccional de zonas por forma, tamaño y trayectoria.
- Umbral de confianza: los cuadros dudosos se omiten y quedan visibles en un
  informe navegable.
- Cierre visual de huecos ajustable entre 0 y 10 píxeles sin deformar el trazo.
- Color Art separado de Line Art, con identidad estable de zona y de estilo de
  paleta.
- Una operación multicuadro se deshace y rehace con un solo `Ctrl+Z`.

## Estabilidad

- El análisis raster del relleno ya no hereda el zoom ni el desplazamiento del
  visor, evitando zonas deformadas o mal detectadas.
- Si ocurre un fallo inesperado, el documento se restaura sin dejar cuadros
  parcialmente coloreados.
- La propagación hacia cuadros anteriores y posteriores mantiene trayectorias
  independientes.

## Verificación

- 270 pruebas del modelo 2D.
- Contratos automáticos de Escape, rueda, modos, rig, vectores y tableta.
- Recorrido E2E en Chromium real para colorear dos dibujos desplazados,
  comprobar Line/Colour Art y verificar undo/redo atómico.
