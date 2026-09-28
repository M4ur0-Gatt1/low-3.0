# LOW v4.4.2 — El pincel dibuja con su color, barra movible y los P0 que faltaban

## Corregido

### El pincel dibujaba blanco sobre blanco

El trazo terminado del pincel es una cinta **rellena**, y se etiquetaba con el
papel `paint`. Eso lo ataba al estilo **«Relleno»** de la paleta —blanco por
defecto—, que la hoja de estilos impone con `!important` y por lo tanto le ganaba
al color del propio trazo. Sobre papel blanco el resultado es invisible: el
pincel parecía no dibujar, y desde luego no respetaba el color configurado.

Medido sobre `v4.4.1`: el mismo gesto dejaba el lápiz en `rgb(26,26,26)` y el
pincel en `rgb(255,255,255)`, etiquetado con el estilo 3 en vez del 1.

Ahora se separan las dos cosas que estaban mezcladas: **qué** estilo manda (el de
tinta, como el lápiz) y **en qué atributo** se aplica (el relleno, porque la
cinta se pinta con `fill`).

### Barra de herramientas al modo Photoshop

- **Se puede mover.** Se arrastra del grip y flota; soltarla contra un borde la
  acopla de ese lado, y doble clic la devuelve. La posición se recuerda.
- **Lo que casi no se usa vive detrás de `⋯`.** Vectores, pivote, espejo,
  imagen, cámara, esqueleto y escenario salen del riel y quedan a un clic.
- **El reparto es responsivo:** cuando la ventana no da altura, las últimas
  herramientas del riel bajan solas al cajón en vez de quedar debajo del borde.
  En una ventana alta entran las catorce y el riel mide los mismos 44 px de
  siempre. Esto reemplaza el ensanchado a dos columnas de `v4.4.0`, que costaba
  lienzo en todas las ventanas.

### P0 de la matriz de regresión

- **`STYLE-02`** — reasignar y borrar un estilo es **una** operación reversible.
  Hechas por separado, un solo `Ctrl+Z` deshacía el borrado y dejaba los usos ya
  reasignados (o al revés): justo la referencia huérfana que la matriz prohíbe.
  El menú de la paleta ofrece «Reasignar y borrar…» para un estilo en uso.
- **`LEVEL-01`** — crear un nivel **propone** un nombre descriptivo en vez de
  inventar «Nivel 7» en silencio, y ahora los niveles se pueden **renombrar**
  (doble clic en el encabezado del Level Strip). El id interno —lo que
  referencian capas, celdas y paleta— no cambia al renombrar, así que ninguna
  referencia se rompe.
- **`CRASH-01`** — informe de fallo con versión, sistema, GPU/render, tamaño de
  la escena y último comando. Se escribe solo ante un error no atrapado y a
  pedido desde **Ayuda → Informe de fallo…**. Los campos son una **lista blanca**
  en los dos lados del puente: no viaja el dibujo, ni la conversación, ni rutas
  completas — del archivo va sólo el nombre.

## Pruebas

- Modelo 2D **347/347** (14 nuevas: transacción de estilos e identidad de
  niveles). Multiplano 14/14, colaboración 8/8, malla 15/15, schematic 16/16.
- El E2E de pinceles verifica el color del trazo contra el estilo de tinta y
  contra el de relleno. Se comprobó que **falla** en `v4.4.1`.
- Nueve contratos estáticos nuevos: color del pincel, barra movible, cajón de
  desborde, transacción de estilos, identidad de niveles e informe de fallo.
- Los **10** recorridos E2E de Chromium en verde.

## Pendiente

- Smoke del ejecutable empaquetado.
- Quedan abiertos de la matriz: `SAVE-03` y `SAVE-04` cerrados en `v4.4.1`;
  `HIST-02` sigue parcial (modelo automatizado, interacción no).
- `check_color_studio_ui.js` pasa localmente pero sigue fuera de CI.

## Reversión

Estable previa: `v4.4.1`. Ningún cambio toca el formato de `.lowscene` ni el de
los `.svg`. Un dibujo hecho con el pincel en `v4.4.1` queda etiquetado con el
estilo «Relleno»; para pasarlo al color de línea, reasignar ese estilo desde la
paleta.
