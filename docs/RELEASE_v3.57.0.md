# LOW 3.57.0 · La planilla de producción

Pedido de Mauro: «un seguimiento de pasos de producción, como si fuera una planilla de planificación, con los pasos para ir tildando a medida que avanza la producción: diseño de personajes, storyboards, diseño de fondos… como una guía de trabajo».

## Ventana → Planilla de producción…

Un panel flotante, que se arrastra por el encabezado, con la guía de trabajo de la obra.

- **Empezar con la guía de un corto.** Trae tres etapas con 23 pasos:
  - **Preproducción:** idea y sinopsis, guion, diseño de personajes, hoja de modelo y giro, storyboard, voces y audio guía, animática, diseño de fondos y layouts, paleta de color.
  - **Producción:** layout de cada plano, rig de los personajes, poses clave, intercalado, limpieza de línea, color y pintura, fondos finales y composición.
  - **Postproducción:** sincronía labial, música y efectos, montaje, revisión en la vista previa, exportación final y copia de seguridad.
- **También se puede empezar vacía**, con las tres etapas y sin pasos, para armar una propia.
- **Cada paso:**
  - **se tilda cuando está hecho** y guarda la fecha, o se marca **en curso**;
  - lleva una **nota** y **quién lo hace**;
  - **«Ir»** abre su herramienta en LOW: el estudio 3D para personajes y fondos, el storyboard, la cámara, el esqueleto, la X-sheet, la profundidad, el audio, la vista previa o la exportación.
- **Los pasos se agregan, se renombran con doble clic y se quitan.** La guía es un punto de partida, no una ley.
- **Arriba se ve el avance** (cuántos pasos hechos, el porcentaje y cuántos en curso) y cada etapa muestra su cuenta. Las etapas se pliegan.

### Dónde se guarda

- **La planilla va adentro del `.low`:** quien abre el archivo ve en qué está la producción.
- **Cada cambio es un paso de Ctrl+Z,** así que tildar el paso equivocado se deshace como cualquier otra cosa. Tildar marca el documento como modificado.
- **Un archivo no decide qué se ejecuta.** «Ir» sólo abre una lista fija de herramientas; un destino que no está en esa lista se descarta al abrir el archivo y no hace nada.

## Arreglo

- **Ayuda → Prueba maestra §15… no abría con el mouse.**
  - Los ítems del menú se disparan al apretar el botón, y el menú se cierra en ese momento; el panel esperaba el clic, que ya no caía sobre el ítem.
  - Sólo abría con `.click()` desde código, y su prueba tenía un respaldo que lo tapaba.
  - Ahora abre con el mouse, y la prueba lo exige.

## Pruebas

- **`tools/run_produccion_tests.js`** (nueva, en el build): 35 pruebas.
  - La guía y el normalizador.
  - La ida y vuelta por archivo: lo tildado, en curso, la nota, quién y los pasos propios sobreviven a guardar y reabrir.
  - Deshacer y Rehacer paso por paso.
  - «Ir» sólo con los destinos conocidos, y el aviso sin documento.
  - Se rompieron a propósito cinco partes del código y las pruebas detectan cuatro. La quinta, no borrar la fecha al destildar, ya la cubre el normalizador.
- **`tools/check_produccion_ui.js`** (nueva, en el build): el recorrido con el mouse de verdad.
  - Se abre desde el menú Ventana, se empieza con la guía y se tilda.
  - El documento queda modificado, y Ctrl+Z y Ctrl+Shift+Z funcionan.
  - «Ir» abre el storyboard y el estudio 3D, y las etapas se pliegan.
  - La planilla va en el JSON de la escena.
- **`tools/check_prueba15_ui.js`**: ahora abre la prueba con el mouse. Con el código anterior, falla.
