# LOW 3.24.0 — Vista previa antes de exportar

Pedido de Mauro: «quiero poder reproducir una preview antes de exportar, dentro de la pantalla».

## Cómo se usa

**Exportar animación → ▶ Vista previa** (también en el menú: *Vista previa de la exportación…*).

Se abre un reproductor dentro de LOW con **lo que va a salir**, que no es lo mismo que reproducir la línea de tiempo:

- sólo el tramo **In/Out**;
- **por la cámara**, si tiene claves;
- con las **poses del rig**;
- con los cuadros vacíos como **papel**;
- y sin papel cebolla, guías ni zoom.

Los cuadros se arman con la **misma función** que usa la exportación, así que la vista previa no puede mostrar algo distinto de lo que sale.

Controles:

- **▶ / ⏸** o **Espacio**. Con la vista previa abierta, Espacio es reproducir, no la mano del lienzo.
- **La barra** o **← →** recorren cuadro a cuadro y hacen sonar el pedacito de audio de ese cuadro, como el scrub de la línea de tiempo.
- **En bucle** (prendido por omisión). Sin bucle, se detiene en el último cuadro.
- **El audio de la escena** suena sincronizado, con su desplazamiento, y vuelve a arrancar en cada vuelta del bucle.
- Abajo están **los mismos botones de exportar**: si está bien, se exporta directo desde ahí, y se elige dónde guardar como en la 3.23.

Se prepara a tamaño de pantalla, hasta 1280 px, para que un tramo largo esté listo rápido. Cerrar con **Cerrar**, **Esc** o un clic afuera corta la preparación, la reproducción y el audio: no queda nada corriendo de fondo.

## Pruebas

- **`check_vista_previa_export_ui.js`** (nueva), con clics y teclas de verdad. Comprueba:
  - el botón en el modal de exportar;
  - que prepare los seis cuadros del tramo;
  - el píxel de cada cuadro: el dibujo del cuadro 1 a la izquierda y el del 4 a la derecha, del mismo tamaño;
  - que los controles y los botones queden a la vista sin scroll a 1366×768 y a 1000×560;
  - las flechas, con su scrub de audio;
  - que Espacio reproduzca la vista previa y no la mano ni la línea de tiempo;
  - que el audio arranque desde el cuadro actual;
  - el bucle, que vuelve a arrancar el audio;
  - la pausa, que corta el audio y deja de avanzar;
  - que sin bucle se detenga en el último cuadro;
  - que Esc cierre sin dejar nada de fondo;
  - que exportar desde la vista previa saque los seis cuadros.

  Falla sin el cambio.
- La exportación y la vista previa comparten `dzExportCuadroSvg` (`export-cuadros.js`), y el contrato 2D exige que la exportación lo use.
- Traducciones al inglés y al portugués de la vista previa y de los botones del modal de exportar, que estaban sin traducir.
