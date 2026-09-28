# LOW v3.29.42 — La paleta gobierna el color

Esta versión cierra la parte de color de la fase 8 del módulo 2D
(`docs/2D_REDESIGN.md`): el trazo deja de guardar un color y guarda el **número
de un estilo**, así que el color vive en un solo lugar.

## Cambios principales

- El estilo suma un **número corto**, además de su `id`, y ese número es lo que
  queda escrito en el dibujo. Se referencia el número y no el `id` por lo mismo
  que la celda de la X-sheet lleva el número del dibujo: un uid repetido en cada
  elemento del SVG no se lee ni se escribe a mano. El número no se reordena ni
  se reusa. Las paletas guardadas antes reciben número al abrirse, en el orden
  en que estaban, así que ninguna referencia se pierde.
- **Línea y relleno por separado**, como el ink & paint de siempre: `data-stk`
  gobierna la línea, `data-fil` el relleno. El lápiz y la pluma son línea; el
  pincel de LOW es una cinta rellena.
- El color se resuelve con una **hoja de estilos inyectada en el SVG**, no
  reescribiendo los dibujos. Por eso el color literal queda igual en el archivo
  como respaldo —el `.svg` guardado se lleva la hoja, así que afuera de LOW se
  ve con los colores de hoy— y recolorear es cambiar una línea de texto: se ve
  al instante en todos los dibujos, expuestos o no.
- **Panel de paleta**: un casillero por estilo con su número, su color y
  **cuántos elementos lo usan**. Recolorear en vivo desde el casillero,
  renombrar, duplicar, unificar dos estilos y borrar. Si la paleta está
  bloqueada, el panel no ofrece lo que el modelo va a rechazar.
- **Borrar un estilo no recolorea nada**: los trazos se quedan con el color que
  tienen y quedan señalados como sueltos, para reasignarlos cuando se quiera.
- **Adoptar**: mete en la paleta los colores de lo que ya estaba dibujado, sin
  cambiar cómo se ve. Sin eso la paleta gobernaría solo lo nuevo y el trabajo
  anterior quedaría afuera para siempre.
- Un solo paso de historial por arrastre del selector de color, no uno por cada
  evento del selector.
- Al papel cebolla se le sacan las referencias de estilo: el fantasma se tiñe
  entero, y si conservara la referencia la paleta le impondría su color y el
  cebolla dejaría de distinguir el pasado del futuro.
- Las miniaturas del Level Strip también muestran el color de hoy.

## Verificación

- ✅ 140/140 pruebas del modelo 2D (20 nuevas).
- ✅ Las pruebas nuevas tienen filo: se rompió el código a propósito en cinco
  puntos —la resolución del color, el salteo de lo ya marcado en *Adoptar*, el
  conteo de uso, el filtro de `fill="none"` y el reparto de números— y las cinco
  mutaciones hacen caer pruebas.
- ✅ Verificación en la aplicación con **eventos de puntero reales**, no solo en
  tests: clic en el casillero 4 → el lápiz pasa a ese estilo → se dibuja un
  trazo → queda con `data-stk="4"` y su color literal de respaldo → se arrastra
  el selector y el trazo ya dibujado cambia en vivo → al soltar queda un paso de
  historial y `Ctrl+Z` devuelve el color, en el modelo y en el panel.
- ✅ *Adoptar* sobre un dibujo con colores literales: 5 elementos adoptados, 3
  estilos nuevos para los colores que no estaban, los que ya estaban reusados, y
  el dibujo idéntico en pantalla.
- ✅ Guardar y reabrir la escena conserva la paleta con sus números y colores.
- ✅ La hoja de estilos no entra al `Drawing` y sí viaja en el `.svg` guardado,
  una sola vez.
- ✅ Fuentes de versión sincronizadas en `3.29.42`: `VERSION`, `LOW_VERSION`,
  `AppVersion` del instalador y el paquete híbrido. Scripts de `ui/index.html`
  sellados con `?v=3.29.42`.
- ⏳ **Sigue pendiente de v3.29.41**: la prueba manual de los tres flujos 3D.
  No la ejecutó nadie todavía; que esta versión salga no la convierte en
  aprobada.
- ⏳ Prueba manual del 2D sobre el ejecutable final: dibujar con un estilo,
  recolorearlo, adoptar un dibujo viejo, guardar, reabrir y comparar
  Viewer/export.

## Lo que esta versión NO hace

La paleta gobierna lo que se dibuja a mano con lápiz, pincel y pluma. Las formas
del menú de inserción (rectángulo, estrella, texto) y lo importado siguen
naciendo con color literal: entran a la paleta con **Adoptar**, que es
justamente para eso.

De la fase 8 quedan **pegbars, function editor y schematic**.
