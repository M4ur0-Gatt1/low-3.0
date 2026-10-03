# LOW 3.1.1 — correcciones de guardado y animación

## Correcciones

- Guardar desde el botón de la barra ahora escribe el documento `.low`, igual que Ctrl+S y Archivo → Guardar. Antes el botón intentaba guardar un SVG y no escribía la escena.
- Guardar una escena limpia también el indicador del lienzo. Volcar un dibujo sin cambios no vuelve a marcarlo como modificado.
- El primer trazo sobre una celda vacía se deshace en una sola acción, incluyendo la creación del dibujo. Rehacer recupera la celda y su contenido.
- Crear y duplicar desde Dibujos del nivel son acciones completas: un Deshacer restaura la exposición anterior y no deja un dibujo residual.
- Renumerar rechaza números negativos y fraccionarios. Borrar y renumerar respetan las capas bloqueadas, incluidas las que comparten el dibujo.

## Correcciones de Claude incluidas desde 90c0ff5

- Papel cebolla visible sobre la hoja blanca.
- Faders de cebolla sin saltos del panel durante el arrastre.
- Barra de herramientas de timeline accesible en ventanas bajas.
- Menú de Dibujos del nivel operable y borrado que no reaparece por el volcado del lienzo.
- Interpretar usa los colores y controles de LOW, también en tema claro.

## La línea de tiempo aparecía vacía (encontrado antes de publicar)

Con estas correcciones en el árbol, abrir un documento y desplegar la línea de tiempo dejaba el panel **sin «+ Capa» y sin capas**: se veía la grilla vieja del `.svg` suelto en lugar de la línea de tiempo del documento. Cuatro recorridos de la puerta cayeron juntos.

No era un dibujo mal hecho sino una **carrera**: dos dibujantes para el mismo hueco. El viejo revisaba si ya existía la vista nueva *antes* de esperar al puente y, al volver, pisaba la que se había dibujado mientras tanto. Que ganara uno u otro dependía de cuánto tardaba cada camino, por eso un cambio sin relación (no volver a marcar como modificado un dibujo sin cambios) alcanzó para hacerlo aparecer.

Ahora, con un documento abierto, la línea de tiempo es siempre la del documento, gane quien gane. Nueva prueba en CI, `check_timeline_una_vista_ui.js`, verificada por mutación: falla sin el arreglo y pasa con él.

## Verificación

Pruebas de modelo, puente de archivos y recorridos de interfaz de la puerta de calidad. Se agregaron regresiones que fallaban antes de las correcciones para el botón Guardar, el estado después de guardar, el primer trazo, la renumeración y el bloqueo de capas. El recorrido de Dibujos del nivel verifica clics, Undo y Redo.

Además se comprobó el puente real de Windows con WebView2 y un perfil aislado: crear `.low`, volcar tres dibujos al lienzo, guardar con el controlador del botón, cerrar la pestaña y reabrir desde el disco. La entrada física del lápiz se verifica en el navegador de pruebas; esta comprobación nativa usa comandos del lienzo. No sustituye una sesión humana con tableta ni demuestra ausencia de otros errores.
