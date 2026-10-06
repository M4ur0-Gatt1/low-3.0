# LOW 3.9.0 — El pincel por defecto es suave, los cuadros se mueven con una manija y la mano se ve

## El pincel por defecto, fluido y suave

Reporte de un usuario: «el pincel por defecto es un poco vectorial, tosco».

**Por qué era tosco.** LOW arrancaba **sin ningún pincel elegido**. El selector mostraba «Lápiz de animación», pero el Pincel dibujaba con un camino viejo, de antes del motor de pinceles, y ese camino:

- armaba el borde con muy pocos puntos, suavizando cada lado por separado: los bordes dejaban de ser paralelos y se quebraban en las curvas;
- hacía el remate contando puntos, no distancia;
- cortaba los extremos en recto.

Medido con un mismo trazo en S: tres quiebres de más de 30° en el contorno, hasta 105° en las puntas.

**Ahora:**

- **Siempre hay un pincel elegido.** Por defecto es «Tinta limpia», y el que elijas se recuerda al reabrir LOW.
- **El contorno de la cinta vectorial se rehízo:**
  - el ancho se suaviza a lo largo del trazo, así que la presión ya no deja escalones;
  - la dirección se toma de una ventana y no del punto vecino, así que los bordes quedan paralelos en las curvas;
  - las puntas son redondas cuando el trazo no termina afinándose;
  - el borde es una curva, sin facetas.
- **El mismo trazo en S:** cero quiebres de más de 30°, y pesa 6,9 KB en el archivo. Antes, con un pincel elegido, el contorno salía de 6.464 tramos rectos, unos 190 KB por trazo.
- **El suavizado se recuerda al reabrir.** Antes se guardaba en una clave y se leía de otra.
- **El espaciado se apaga en los pinceles vectoriales.** En el Estudio aparece desactivado, con la explicación. Medido: de 0,01 a 1 la cinta no se movía ni media unidad. El espaciado separa los sellos de los pinceles de mapa de bits, y una cinta no tiene sellos.

## Mover cuadros en la línea de tiempo

Pedido de Mauro: «quiero poder mover los frames de lugar eligiéndolos en la línea de tiempo».

Mover ya existía, pero escondido: había que arrastrar con Alt. Y apretar sobre lo seleccionado no puede mover, porque arrastrar siempre selecciona (así se pidió antes: si no, al volver a seleccionar se desordenaba la escena).

**Ahora** la selección lleva una **manija naranja** a la izquierda, como la barra de arrastre de las celdas de OpenToonz:

- **La manija:** se agarra y los cuadros van adonde la soltás. Mientras arrastrás se ve el destino. Todas las capas de la selección se mueven juntas, en un solo paso de Ctrl+Z, y la selección acompaña a los cuadros.
- **Alt+← y Alt+→** corren la selección un cuadro.
- **El clic derecho** ofrece «Mover un cuadro antes» y «Mover un cuadro después».
- **Arrastrar en cualquier otro lado** sigue seleccionando.

## La mano se ve

Reporte de Mauro: «muchas veces cuando aprieto la barra espaciadora para navegar con la manito, el ícono de la mano no aparece».

**Por qué.**

- **Herramientas con cursor propio** (Pincel, Lápiz, Goma, Balde…): una regla que esconde el cursor del sistema para dibujar el anillo le ganaba a la mano. No se veía mano ninguna y seguía el anillo del pincel.
- **Flecha:** los trazos tenían su propio cursor.
- **Ventana sin foco:** si la ventana perdía el foco con el espacio apretado, la mano quedaba pegada.

**Ahora**, con el espacio apretado:

- se ve la mano sobre todo el lienzo, y el anillo de la herramienta se esconde;
- al apretar el botón, la mano agarra;
- al soltar el espacio vuelve el cursor de la herramienta;
- al perder el foco, la mano se suelta.

## Enderezar la mesa, a la vista

Reporte de Mauro: «no encuentro el botón para restablecer el giro de la mesa de animación al punto inicial».

Enderezar ya existía (doble clic en el dial, o Vista → Enderezar la vista), pero no se veía. Ahora, mientras la mesa está girada, el dial muestra un botón **«↺ 0°»**.

## Pruebas

**Nuevas.** Las tres usan el mouse y el teclado de verdad, y las tres fallan con el código anterior:

- **`check_pincel_suave_ui.js`** comprueba que:
  - hay un pincel elegido al arrancar y el selector lo muestra;
  - un trazo en S sale curvo, sin quiebres de más de 30° y con menos de 20 KB;
  - el pincel y el suavizado se recuerdan al reabrir.
- **`check_mover_cuadros_ui.js`** comprueba que:
  - la manija aparece en el primer cuadro de la selección;
  - llevarla al cuadro 6 mueve los cuadros en un solo paso y la selección los acompaña;
  - Ctrl+Z deja la línea de tiempo exacta;
  - arrastrar sobre lo seleccionado, fuera de la manija, sigue seleccionando;
  - Alt+→ corre la selección un cuadro;
  - el menú del clic derecho ofrece mover.
- **`check_mano_ui.js`** comprueba, con el Pincel y con la Flecha, sobre la hoja y sobre un trazo, que:
  - con el espacio apretado se ve la mano y el anillo se esconde;
  - al apretar el botón, la mano agarra;
  - al soltar el espacio vuelve el cursor de la herramienta;
  - al perder el foco, la mano no queda pegada.

**Ampliadas o corregidas:**

- **`check_mesa_animacion_ui.js`:** con la mesa girada aparece «↺ 0°», un clic la endereza y el botón se va.
- **`check_brush_params_ui.js`:** los pinceles vectoriales se comparan por geometría, muestreando los dos contornos. La comparación por texto se confundía cuando el mismo gesto dejaba un punto más o uno menos. Esa comparación es la que mostró que el espaciado no hacía nada en la cinta.
- **`run_pinceles_tests.js`:** el ancho de los remates se mide entre los dos bordes que devuelve el motor, porque el contorno curvo ya no se puede leer como una lista de puntos.
- `check_trazo_calidad_ui.js` mide el temblor del pincel sobre su **eje**, que es la curva que sigue, y no sobre su contorno. El contorno está a medio grosor del eje, y ahora que el pincel dibuja con el grosor que marca la barra, ese medio grosor se leía como temblor (1,97 unidades). Medido sobre el eje, el temblor es 0.
- `check_escala_contorno_ui.js` espera a que la página termine de cargar antes de armar la prueba. Fallaba de a ratos en la puerta y pasaba sola.
