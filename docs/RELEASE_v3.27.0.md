# LOW 3.27.0 — Limpieza de línea: Cuchilla, Cinta, Pinza exacta; mover en línea con Shift

Pedidos de Mauro:
- «una herramienta cuchilla para cortar líneas de vector que se cruzan, como en Toon Boom u OpenToonz… suma todas esas herramientas, también una que sirve para unir líneas, eliminar huecos; copiemos esas herramientas en su flujo completo».
- «si estoy con la herramienta selección y muevo un objeto apretando Shift, que mantenga la línea en la que está».

## Cuchilla — Shift+T (el atajo del Cutter de Harmony)

Es el borrador por «segmento» de OpenToonz y el gesto del Cutter de Toon Boom.

- **Clic sobre un tramo:** se borra **sólo ese tramo, de cruce a cruce**. Lo que sobra pasado una esquina se va de un clic. Si la línea no cruza nada, se borra entera.
- **Arrastrar cruzando líneas:** se borran todos los tramos que cruzás.
- **Al pasar el mouse** se marca en naranja lo que se va a borrar.
- **Recortar sobrantes:** las colitas que pasan del último cruce y miden menos que lo elegido (14 px por omisión) se van todas de una vez. Las largas quedan.
- Una **T** que no llegó a cruzar por unos píxeles también cuenta como cruce.

## Cinta — Alt+C (el atajo del Close Gap de Harmony)

Es la «Tape» de OpenToonz.

- **Desde la punta de una línea hasta la punta de otra:** se **sueldan** en una sola línea. Si es la otra punta de la misma línea, se **cierra la figura**.
- **Hasta el cuerpo de otra línea:** la punta **se prolonga** hasta tocarla.
- **Un rectángulo desde un lugar vacío:** se cierran **todos los huecos de adentro**, hasta la distancia elegida (12 px por omisión). **Cerrar todos los huecos** hace lo mismo con todo el dibujo.
- **Unión: «Sólo para pintar (invisible)».** En vez de soldar deja un **cierre invisible**, como los trazos invisibles de Harmony:
  - el balde lo respeta;
  - no se ve ni sale en el export;
  - se muestra punteado en celeste mientras usás la Cinta o el Balde;
  - **Borrar cierres invisibles** los saca.

## Pinza — X, arreglada

Parte una línea en dos donde hacés clic. **Antes convertía el tramo curvo en recto y deformaba la línea.** Ahora la parte **exacta**: con la Pinza vieja una curva quedaba corrida hasta 38 unidades, y ahora 0,003.

## Exactas, también con pinceles

Las líneas del lápiz, la pluma, la regla y las figuras se cortan sobre sus **curvas Bézier**, partiéndolas en el punto exacto (De Casteljau): cada pieza es el mismo tramo de la curva, no una aproximación. Lo mismo al soldar y al prolongar. Los círculos y las elipses pasan a cuatro curvas, con menos de 0,03 % de diferencia del radio.

El **pincel** se corta sobre su línea central y se vuelve a dibujar con su mismo pincel, presión incluida. Cada acción es **un paso de Ctrl+Z**.

## Mover con Shift: sobre su línea, como Illustrator

Con la flecha o la flecha blanca, **Shift mientras arrastrás** deja el objeto **horizontal, vertical o a 45°**: la dirección que más se parezca al arrastre. Si apretás Shift sobre algo **ya elegido** y arrastrás, se mueve en línea y no se deselecciona. Shift+clic **sin mover** lo saca de la selección, como antes. En el rig, Shift sigue siendo rotar la pieza.

## Pruebas

- **`run_limpieza_tests.js`** (nueva, 31 casos, en node). Cubre:
  - el «#» de cruces y la T que no llega;
  - un lazo y un cuadrado cerrado, también cuando el tramo pasa por el arranque;
  - partir, sobrantes, huecos y unir;
  - y que el corte Bézier coincida con la curva original con error menor a 10⁻⁹.
- **`check_limpieza_ui.js`** (nueva), con mouse y teclado de verdad. Comprueba:
  - Shift+T y la marca al pasar el mouse;
  - el clic en una colita y en el medio de una línea;
  - el gesto, y que Ctrl+Z lo deshaga en un paso;
  - que un pincel se corte en el cruce y siga siendo pincel;
  - que «Recortar sobrantes» saque las cortas y respete las largas;
  - que la Pinza parta una curva sin deformarla;
  - con Alt+C: soldar, prolongar y el rectángulo que cierra cuatro esquinas;
  - el cierre invisible: no se ve, se guarda y el balde pinta adentro.

  Falla con la Pinza vieja.
- **`check_mover_en_linea_ui.js`** (nueva):
  - sin Shift el movimiento es libre;
  - con Shift queda horizontal, vertical o a 45° exactos;
  - Shift desde el clic sobre lo elegido mueve en línea y no lo deselecciona;
  - Shift+clic sin mover lo saca;
  - Ctrl+Z.

  Falla con el código anterior.
