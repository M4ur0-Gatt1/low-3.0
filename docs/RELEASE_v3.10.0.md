# LOW 3.10.0 — Esculpir trazos: modelar una línea que ya está, y redibujar un tramo

Pedido de Mauro: un pincel que deforme un trazo existente como el Sculpt Mode de Blender, con un modo para **redibujar** un tramo. «No quiero que simplemente se genere otra línea encima.» «Que se sienta como modelar una línea con el lápiz, no como editar nodos.» Y: «una herramienta nueva, no sobre el deformador que ya existe».

## La herramienta

**Esculpir trazos** está con las herramientas de vectores, en el botón **«…» (Más herramientas)** del riel. Se pasa el pincel por encima de cualquier trazo de **Pincel** o de **Lápiz**: el trazo cambia de recorrido y **sigue siendo el mismo**. Conserva su id, su color de paleta, su capa, su pincel, su grosor y su presión, y no aparece ninguna línea nueva.

| Modo | Qué hace |
|---|---|
| **Agarrar** | Agarra una sección y la lleva adonde va el lápiz. |
| **Empujar** | Empuja el trazo en la dirección del lápiz; con «De costado», sólo hacia el costado. |
| **Atraer** | Trae el trazo hacia el cursor. |
| **Curvar** | Arquea un tramo midiendo a lo largo del trazo: no arrastra lo que está cerca en el papel pero lejos en la línea. |
| **Suavizar** | Saca las irregularidades. |
| **Relajar** | Reparte los puntos parejo sin cambiar la forma. |
| **Enderezar** | Lleva el tramo de a poco hacia una recta. |
| **Pellizcar** / **Expandir** | Junta o separa el recorrido respecto del centro del pincel. |
| **Redibujar** | Dibujás encima de un tramo el recorrido que querés y el trazo lo toma. |

### Redibujar

Empezás y terminás tu dibujo **sobre** el trazo, en el tramo que querés cambiar. LOW:

1. encuentra ese tramo, también si lo dibujaste al revés;
2. lo reemplaza por tu recorrido, que toma la presión del tramo original;
3. lo une a las dos partes que no tocaste sin escalón ni quiebre.

Si empezás o terminás lejos del trazo, no cambia nada y te dice cómo se usa.

### Con el lápiz

- **Radio y fuerza** en la barra. En **«Opciones…»**:
  - la **caída** (suave, lineal o firme);
  - la **presión → fuerza** y la **presión → radio**, entre un mínimo y un máximo;
  - **de costado**.
- **Mayús** suaviza mientras la apretás, y **Ctrl** invierte (atraer pasa a alejar; pellizcar, a expandir).
- **Espejo:** con el Espejo prendido, se esculpe también del otro lado del eje.
- **Barra espaciadora:** panea, no esculpe.
- **Ctrl+Z:** cada pasada es un paso, con su nombre (por ejemplo «Esculpir · Agarrar»).

## Por qué no quedan picos ni rectas

- **Antes de deformar, el trazo se subdivide.** Un trazo recto queda guardado con dos puntos, y mover puntos sueltos dejaría rectas y picos.
- **La caída es suave** (smoothstep), sin escalón en el borde del pincel. Si un tramo se estira durante el gesto, se vuelve a subdividir.
- **Al soltar, se simplifica** para no acumular puntos, y la presión cuenta como una dimensión más: no se pierde la variación de grosor.
- **Pincel y lápiz se tratan distinto:**
  - el **pincel** se deforma sobre sus puntos guardados (con presión) y se vuelve a dibujar con su mismo pincel;
  - el **lápiz** sólo guardaba el dibujo; la primera vez se toman sus puntos y quedan guardados en el trazo, así la siguiente pasada parte del recorrido exacto.

## Pruebas

- **`run_esculpir_tests.js`** (nueva, 15 casos) prueba la matemática de cada modo: hace lo que dice, sin picos, con las puntas y la presión en su lugar. Redibujar se prueba en los dos sentidos y lejos del trazo; también se prueban la subdivisión y la simplificación. Con las operaciones anuladas, las pruebas fallan.
- **`check_esculpir_ui.js`** (nueva) usa el mouse y el teclado de verdad. Comprueba que:
  - la herramienta y sus opciones están, entran en la barra a 1366 y, a media pantalla, la barra hace scroll como con las demás herramientas;
  - «Opciones…» se ve y se puede tocar, porque la barra recortaba el desplegable;
  - **Agarrar**: es el mismo elemento, las puntas quedan quietas, el contorno no tiene quiebres, la pasada es un paso llamado «Esculpir · Agarrar» y Ctrl+Z vuelve los puntos exactos;
  - **Redibujar**: el trazo toma el arco, sigue siendo uno solo, con un solo contorno y las mismas puntas, y lejos de todo trazo no cambia nada;
  - **Suavizar** un zigzag de Lápiz lo baja de 12,2 a 5,4, conserva el grosor y deja guardados los puntos;
  - con el espacio apretado se panea en vez de esculpir.

Probada también en la app real (WebView2): agarrar y curvar sobre un trazo de pincel.

## Arreglado en las pruebas

**65 esperas en 64 pruebas** de recorrido empezaban a manejar la página apenas existía la función que necesitaban, sin esperar a que terminaran de cargar los módulos que van después de `app.js`. Con cada módulo nuevo, esa carrera fallaba más seguido en la puerta y siempre en una prueba distinta:

- «dzCanvasInner is not defined»;
- «dzNodesClear is not defined»;
- «la forma no quedó seleccionada».

Ahora todas esperan a que la página termine de cargar.
