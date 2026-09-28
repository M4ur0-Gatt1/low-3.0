# LOW v4.7.1 — La cabecera en tres filas

Photoshop resuelve el mismo contenido en tres filas —menú, barra de opciones y
pestañas— y LOW estaba usando cuatro. La fila de más se comía **37 px** de
lienzo en todas las pantallas, todo el tiempo.

## Corregido

- La barra de iconos (agrupar, duplicar, borrar, variaciones, animación,
  documento, giro de vista, zoom, reglas, cuadrícula, guías, modo dibujo,
  preferencias, código, guardar, abrir afuera, cerrar) dejó de tener fila propia
  y ahora vive **en la misma línea** que las opciones de la herramienta activa,
  pegada a la derecha. Es exactamente el reparto de la barra de opciones de
  Photoshop: a la izquierda lo que depende de la herramienta, a la derecha lo
  que depende del documento y de la vista.
- Cuando falta ancho, lo que se recorta es el **texto de ayuda** de la
  herramienta, nunca un control: una barra que esconde el color o el grosor
  detrás de un scroll no sirve de nada. Por debajo de 1180 px el texto se oculta
  del todo.
- Las pestañas de documento se insertaban al lado de `#dzToolOpts`; ahora que
  las opciones y los iconos comparten fila, se insertan después de **toda** la
  barra.

Altura de la cabecera: **101 px**, contra ~138 px antes.

| Fila | Contenido |
|---|---|
| 1 · 32 px | Menú y workspaces |
| 2 · 36 px | Opciones de la herramienta · documento · vista · ventana |
| 3 · 33 px | Pestañas de documento |

## Pruebas

- El recorrido de documentos verifica ahora que la cabecera son tres filas que
  no se superponen, que los iconos comparten línea con las opciones, que las
  pestañas quedan **fuera** de la barra, y que el alto total no pasa de 115 px.
- Tres contratos estáticos nuevos.
- Los **13** recorridos E2E y las 7 suites de modelo, en verde.

## Reversión

Estable previa: `v4.7.0`. El cambio es de maquetado y CSS; no toca el documento
ni ningún formato.
