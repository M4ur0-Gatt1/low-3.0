
# LOW 3.50.0 · La cámara de Composición es la de After Effects

Pedido de Mauro: «quiero que la cámara del modo composición se parezca más a la cámara virtual que tiene After Effects». Hasta ahora la cámara era 2D: un recuadro sobre la hoja que se paneaba y se achicaba, con un paralaje aproximado. Ahora es una cámara 3D con lente, perspectiva y profundidad de campo.

## La cámara

- **Posición y punto de interés en 3D** (`ui/composition/ae-camera.js`). Hay cámara de dos nodos (siempre mira a su punto de interés) y cámara de un nodo (orientación libre).
- **Lente de verdad**: zoom en píxeles, distancia focal en mm y ángulo de visión, con película de 36 mm y los presets de 15 a 200 mm. Cambiar la lente no es lo mismo que acercar la cámara, así que se puede hacer el dolly zoom (vértigo).
- **Perspectiva**: los planos se proyectan con una cámara estenopeica, se pintan de lejos a cerca y lo que queda detrás de la cámara no se ve.
- **Profundidad de campo**: distancia de enfoque, apertura y nivel de desenfoque. Los planos fuera de foco se desenfocan.
- SVG no tiene transformaciones proyectivas, así que cada plano se aproxima con una transformación afín alrededor del punto que mira la cámara. En órbitas fuertes no se ve el escorzo trapezoidal, pero sí el desplazamiento, la escala, el giro y el orden por profundidad.

## Las herramientas, como en AE

- **Unificada (C)**: izquierdo = órbita, medio o Mayús = track XY, derecho o Alt = track Z.
- **Órbita**, **Track XY** y **Track Z** por separado. La rueda hace dolly y Ctrl+rueda cambia la lente.
- Panel de ajustes: tipo de cámara, preset de lente, posición, punto de interés, rotación, enfoque, «Mirar a la capa elegida» y «Enfocar a la capa elegida».
- Con Auto-key, cada gesto deja **una** clave en **un** paso de Ctrl+Z.

## Compatible con lo que ya había

- Una clave sin `ae` sigue siendo la cámara 2D de siempre y se pinta con el mismo código de antes (`dzCamView`, movido tal cual desde `app.js`).
- Convertir una clave 2D en cámara AE no cambia el cuadro: la cámara AE por omisión da el mismo paralaje que la 2D.
- Una clave AE guarda también `{cx, cy, w, rot}`, así que el recuadro del lienzo 2D, el panel Cámara y la lista de claves la siguen mostrando. Si se la edita desde ahí, el cambio se traslada a la cámara 3D en vez de convertirla en 2D.
- El play, la vista previa y la exportación (MP4, GIF, PNG, Premiere) salen por la cámara AE cuando la clave lo es.

## Arreglos

- **Las ventanas volvieron a tener botones.** En 3.49.0 la barra de acciones del chat usaba la clase `.m-actions`, que también es la fila de botones de todas las ventanas de LOW, y su `opacity: 0` los volvió invisibles. «Seguir un recorrido» se abría sin «Generar» (reporte de Mauro). La barra del chat ahora es `.m-tools`.
- **Un plano de primer plano ya no desaparece con la cámara AE.** La manija Z permite `data-z` -150, y sin el límite de la cámara 2D (-60…400) ese plano quedaba detrás de la cámara por omisión. Al orbitar volvía espejado y gigante. Ahora las dos cámaras usan el mismo rango.
- **La herramienta `anim` del agente anda.** Desde 3.47 respondía siempre «'NoneType' object is not callable»: el método `_anim` quedaba tapado por el atributo `s._anim = None`. Ahora se llama `_anim_tool`.

## Pruebas

- `tools/check_ae_camera_model.js` (nueva): lente, conversión 2D → AE sin saltos (incluidos `data-z` fuera de rango), órbita, tracks, perspectiva, profundidad de campo e interpolación con zoom logarítmico.
- `tools/check_ae_camera_ui.js` (nueva): con puntero real, las cuatro herramientas, órbita que deja una clave AE en un paso, preset de 24 mm, desenfoque, exportación por la cámara AE, edición desde el recuadro 2D y Ctrl+Z.
- `tools/check_anim_tool_backend.py` (nueva): ningún método de `main.py` queda tapado por un atributo, y `_anim_tool` crea un proyecto con el motor real.
- `tools/check_recorrido_ui.js`: ahora exige que «Generar» se **vea**. Antes pasaba igual porque el clic por coordenadas le llega a un botón invisible.
- `tools/check_composition_ui.js`: el paneo pasa a ser Mayús+arrastre (track XY), como en AE.
- Las tres pruebas nuevas entran en el build.
