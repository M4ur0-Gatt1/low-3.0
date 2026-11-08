# LOW 3.58.0 · Jornadas largas sin frenarse, e intercalar toda la secuencia

Dos pedidos de Mauro: «mejorar la confiabilidad del software en procesos largos de trabajo» y «tener incorporadas todas las funcionalidades de animación 2D que Blender trae con sus plugins». Esta versión trae lo primero medido y arreglado, y el primer bloque de lo segundo.

## Una jornada de trabajo, medida

- **Hasta ahora, las pruebas de rendimiento medían una sola operación con LOW recién abierto.** Lo que se rompe en una producción es otra cosa: horas de dibujar, cambiar de cuadro, deshacer y guardar.
- **`tools/check_sesion_larga.js` simula eso.** En cada ronda dibuja 36 trazos en 12 cuadros, va y viene por la línea de tiempo, deshace, rehace, abre y cierra paneles, y guarda. Después de cada ronda mide:
  - la memoria;
  - los nodos del DOM y los oyentes de eventos;
  - el historial de Ctrl+Z;
  - lo que tarda un trazo y un guardado.

### Lo que encontró: el trazo se ponía cada vez más lento

Después de una sesión larga, apoyar el lápiz bloqueaba LOW **unos 100 ms** antes del primer punto, y crecía con el documento.

- **La causa:** la tira «Dibujos del nivel» se reconstruía entera, con una miniatura SVG de cada dibujo, dos veces por trazo (cuando el trazo pasa al documento avisa «cells» y después «content»).
- **Cuándo se sentía:**
  - dibujando rápido, el trazo siguiente adelantaba ese volcado y el bloqueo caía justo al apoyar el lápiz;
  - dibujando lento, caía en la mitad del trazo siguiente.
- **El arreglo:** si el nivel y sus dibujos son los mismos, la tira se actualiza en el lugar. Sólo cambian las clases, los títulos y la miniatura del dibujo tocado. Si cambia la forma (otro nivel, dibujos agregados, quitados o renumerados), se rearma como siempre.

| Por trazo, después de 10 rondas | Antes | Ahora |
|---|---|---|
| Apoyar el lápiz | 102 ms | 21 ms |
| Mover (24 puntos) | 30 ms | 9 ms |
| Soltar | 13 ms | 5 ms |

Con el arreglo, a lo largo de toda la sesión:
- **el tiempo del trazo queda plano:** ×1,1 entre la primera y la última ronda, donde antes se triplicaba;
- **los oyentes de eventos no crecen;**
- **la memoria crece en proporción al documento, sin fuga.**

### Lo que parecía una fuga y no lo es

Los oyentes de eventos subían unos 13 por trazo. Son las filas del panel de capas: una por objeto del cuadro actual, y se van al cambiar a un cuadro vacío. La prueba ahora mide parada en un cuadro vacío.

## Intercalar toda la secuencia (como «Interpolate Sequence» de Blender)

Animación → **Intercalar toda la secuencia…**

- **El «Intercalar…» de siempre** crea intermedios entre este dibujo y el siguiente, y los *inserta*: corre el resto de la escena y cambia el timing.
- **El nuevo respeta el timing que armaste.** Rellena los **sostenidos** entre cada clave y la siguiente de toda la capa, o de un rango, y cada clave sigue en su cuadro.
- **Opciones:**
  - **en unos, en dos o en tres;**
  - **las curvas de Blender:** lineal, seno, cuadrática, cúbica, exponencial, circular, back (se pasa y vuelve), rebote y elástica, de entrada, de salida o las dos.
- **Lo que nunca toca:**
  - un cuadro que ya tiene otro dibujo: sólo reemplaza cuadros que repiten la clave anterior;
  - un hueco vacío entre dos claves: corta el par.
- **El diálogo** dice cuántos dibujos va a crear antes de hacerlo.
- **Todo es un paso de Ctrl+Z,** celdas y dibujos juntos: no quedan dibujos huérfanos.
- **El morph es el mismo de «Intercalar…».**

## Pruebas

- **`tools/check_sesion_larga.js`** (nueva, en el build con 8 rondas). Falla si:
  - los oyentes o los nodos crecen sin techo;
  - el trazo se pone 2,5 veces más lento;
  - la memoria crece más rápido que el documento.
- **`tools/check_tira_dibujos_ui.js`** (nueva, en el build): la tira actualizada en el lugar no queda desactualizada.
  - Un trazo de verdad cambia su miniatura, y las otras siguen siendo los mismos elementos.
  - Ctrl+clic marca la celda.
  - Un dibujo nuevo aparece y renombrar el nivel cambia el encabezado.
  - Al cambiar de nivel se ven sus dibujos.
  - Se rompió a propósito el reemplazo de la miniatura y la marca de selección, y las dos roturas se detectan.
- **`tools/run_intercalar_secuencia_tests.js`** (nueva, en el build): 49 casos.
  - Qué se rellena: en unos, en dos y en tres, el rango, los huecos y los cuadros con otro dibujo.
  - Las 27 curvas empiezan en 0 y terminan en 1, y hacen lo que dice su nombre.
- **`tools/check_intercalar_secuencia_ui.js`** (nueva, en el build): con el mouse de verdad desde el menú.
  - Dos claves en los cuadros 1 y 7 dan 5 intermedios, en x = 200, 300, 400, 500 y 600 con la curva lineal.
  - Las claves no se mueven y la escena no se alarga.
  - Un solo Ctrl+Z vuelve celdas y dibujos.
- **Batería local:** 234 de 237 en verde.
  - `check_rig_skeleton_ui` falló en la corrida seguida y pasa aislada.
  - `check_3d_calles_ui` y `check_reproduccion_fluida_ui` fallan también en `main` sin estos cambios: miden tiempos (un doble clic, cuadros por segundo) y dependen de la carga de la máquina.

## Lo que sigue (plan acordado con Mauro)

1. **Tiempo.** Falta el desfase de tiempo por capa sin destruir (el Time Offset de Blender). Lleva su propio diseño: hay 93 lugares que leen las celdas.
2. **Capas.** Grupos de capas, y mover o emparentar una capa entera.
3. **Modificadores de capa.** Temblor de línea, el trazo que se dibuja solo, contorno y punteado.
4. **Efectos de capa.** Desenfoque, sombra, resplandor y colorear.
5. **Color.** Degradés, texturas en el relleno y pincel de tinte.
6. **Puentes.** Importar PSD u ORA, editar varios cuadros a la vez, smear frames, restricciones, Line Art cuadro a cuadro y hooks.
