# LOW 3.18.0 — El color que elegís es el que queda, Mesa sola con F, el hilo tensado vuelve a dibujar, y Mis pinceles

## El color que elegís es el color con que queda

Reporte de Mauro: «no estoy pudiendo cambiar los colores del contorno de lo que dibujo… mientras dibujo muestra el color que elijo, pero al terminarlo se pone negro».

En un `.low`, el trazo terminado llevaba tu color y, además, el número del estilo activo de la paleta (el 1, negro). La paleta pintaba ese estilo por encima, y el color elegido no se veía nunca. Lo mismo pasaba al recolorear algo ya dibujado con «Contorno».

Ahora es como en Toon Boom y OpenToonz: **el color que elegís en Trazo o en Contorno pasa a ser un estilo de la paleta**. Se usa el estilo que ya tiene ese color, o se crea uno nuevo, y queda activo. Así:

- **El lápiz y el pincel terminan del color elegido.**
- **Recolorear lo elegido funciona:** se ve en vivo mientras arrastrás el selector, y al soltarlo queda con su estilo. En la cinta del pincel cambia la línea, sin agregarle un contorno.
- **Arrastrar el selector de color no llena la paleta** de colores intermedios: se crea un solo estilo, al soltar.
- **Recolorear un estilo desde la paleta sigue igual:** cambia todo lo que usa ese estilo.

## Mesa sola (F) y Modo dibujo (Tab), como en Photoshop

Pedido de Mauro: «quiero que la F sirva para dejar la mesa de trabajo sola, como en Photoshop».

- **F — Mesa sola:** queda sólo la hoja. Se sigue dibujando con los atajos (N, B, V…). F otra vez, Esc o el botón de arriba vuelven a mostrar todo.
- **Tab — Modo dibujo:** la hoja y las herramientas.
- **«Ajustar a la pantalla» pasó a Ctrl+0**, como en Photoshop, o a Alt+F. Shift+F sigue siendo «Enderezar la mesa». Si guardaste tus atajos con una versión anterior, la F nueva igual manda: el mapa viejo traía F para ajustar sin que lo hubieras elegido.
- **El Modo dibujo de Tab estaba roto en Animación:** escondía una lista vieja de paneles, y la X-sheet, los dibujos del nivel, la línea de tiempo nueva y las pestañas quedaban a la vista. Ahora no hay lista: se esconde todo lo que no contiene a la hoja, y un panel que se sume mañana queda escondido igual.

## La Regla / Hilo tensado vuelve a dibujar

Mauro: «antes tenía una función que al apretar Shift me hacía las líneas como un hilo tensado recto, muy útil para perspectivas y objetos 3D; me preocupa que se pierdan funcionalidades».

Es la herramienta **Regla / Hilo tensado (U)**:

- clic para empezar; aparece una banda elástica hasta el puntero;
- clic para crear la línea, y sigue desde ahí;
- **Shift** la ajusta a ángulos de 15°;
- **clic derecho** fija un punto de fuga, y las líneas se tensan hacia él.

Con un `.low` estaba rota por dos defectos:

- **La línea no quedaba en el dibujo:** se agregaba suelta, fuera del plano Línea, y se perdía. Ahora va al plano Línea, con el estilo del color elegido.
- **La banda punteada de la vista previa se guardaba en el dibujo,** como una línea más.

Una prueba nueva recorre la herramienta entera para que no vuelva a perderse sin que se note.

## Interpolación de movimiento: el botón con su nombre

Los mensajes decían «tocá 🏃», pero no hay ningún botón con 🏃, y se confundía con el del ciclo de caminata (🚶). El botón es la flecha **↦** de la línea de tiempo, «Interpolación de movimiento», y los mensajes ahora lo nombran así. El Editor de funciones tenía el mismo ícono que ese botón: ahora tiene uno propio, una curva.

# Mis pinceles: tu propia biblioteca de pinceles

Pedido de Mauro: «me gustaría poder agregar más bibliotecas y tener la posibilidad de generar pinceles propios en la biblioteca local de LOW».

## Lo que había

LOW trae 474 pinceles:

- **42 de fábrica**, en lápices, tintas, pintura, texturas, efectos y borradores.
- **3 bibliotecas incluidas**, de dominio público (CC0):
  - David Revoy · Krita 25.01: 46 pinceles de ilustración;
  - K. M. Alexander · Myer: 148 sellos de árboles y asentamientos para mapas;
  - K. M. Alexander · Mercator: 238 sellos de pueblos y ciudades.
- **Instalar bibliotecas de otros programas** ya andaba: Photoshop `.abr`, Procreate `.brushset`/`.brush`, Krita `.bundle`/`.kpp`, GIMP `.gbr`/`.gih`, MyPaint `.myb`, `.lowbrush`, y puntas en PNG/JPEG/WebP.

Lo que faltaba era hacer pinceles propios de verdad. El Estudio sólo dejaba duplicar un pincel y mover los deslizadores, y esa copia:

- iba al almacén del navegador, donde entran unos 5 MB y no hay archivo a la vista;
- no se podía compartir;
- se perdía al cerrar LOW si lo retocado era un pincel de una biblioteca instalada.

## Mis pinceles

Una biblioteca nueva, **Mis pinceles**: un archivo `.lowbrush` más en la carpeta de pinceles de LOW, al lado de las instaladas. En el Estudio de pinceles, arriba de la lista:

- **Nuevo pincel:** uno redondo básico, para empezar de cero.
- **Punta desde la selección:** lo que tenés elegido con la flecha en la mesa se vuelve la punta de un pincel nuevo. Es el «Definir pincel» de Photoshop: dibujás la forma con las herramientas de LOW, la elegís y ya es un pincel. Lo oscuro es tinta y lo claro, transparente; el trazo se tiñe con el color que uses.
- **Punta desde imagen…:** lo mismo con un PNG o JPG.
- **Exportar…:** guarda la biblioteca elegida como `.lowbrush` para compartirla. En otra máquina se instala con «Instalar biblioteca…».
- **Renombrar** y **Borrar**, en tus pinceles. Borrar pide confirmación, y los trazos que ya hiciste con ese pincel no cambian.

Además:

- **Retocar cualquier pincel** —de fábrica o de una biblioteca— lo copia a Mis pinceles la primera vez, como «… · personalizado». El original no cambia, y lo retocado ya no se pierde al cerrar.
- **Se guarda solo**, un instante después de cada cambio. Se escribe a un temporal y se reemplaza de una vez, para que un corte no deje la biblioteca rota.
- **Tus pinceles propios de antes se mudan solos** a Mis pinceles la primera vez que abrís esta versión. Recién cuando quedan guardados en el archivo se borran del almacén del navegador.
- **Cada pincel propio conserva su identidad.** Antes los pinceles de una biblioteca se numeraban por posición, y borrar uno corría a los demás.
- Todo esto está traducido al inglés y al portugués.

## Más bibliotecas

Estoy buscando más bibliotecas con licencia que permita incluirlas en LOW (CC0 o CC-BY). Antes de bajar alguna te muestro cuáles son, de dónde salen, su licencia y su tamaño.

## Pruebas

Cada prueba nueva falla con la versión anterior.

- **`check_color_elegido_ui.js`** (nueva) usa el ratón de verdad. Comprueba:
  - el lápiz y el pincel terminan del color elegido;
  - diez colores arrastrados crean un solo estilo;
  - recolorear un trazo y una cinta, en vivo y al soltar;
  - recolorear desde la paleta sigue andando;
  - un estilo elegido en la paleta le gana a un color suelto anterior.
- **`check_mesa_sola_ui.js`** (nueva) usa las teclas de verdad, con un mapa de atajos guardado por una versión anterior. Comprueba:
  - F deja la hoja sola y se dibuja igual;
  - F vuelve;
  - Tab deja la hoja y las herramientas;
  - Esc vuelve;
  - Ctrl+0 y Alt+F ajustan a la pantalla;
  - Shift+F sigue enderezando la mesa.
- **`check_hilo_tensado_ui.js`** (nueva) recorre:
  - U, la banda elástica y el trazado continuo;
  - que las líneas queden en el documento y la banda no;
  - Shift a 15° y el punto de fuga.
- **`check_bibliotecas_ui.js`**: el paso de quitar una biblioteca ahora mira sólo esa biblioteca. El pincel propio del paso anterior se mudó a Mis pinceles y tiene que seguir ahí.
- **`check_mis_pinceles_ui.js`** (nueva) hace el recorrido completo con el ratón de verdad:
  1. un pincel propio viejo se muda;
  2. «Nuevo pincel»;
  3. retocar «Tinta limpia» crea la copia y la de fábrica no cambia;
  4. «Punta desde la selección» con una estrella negra, y se dibuja con ese pincel;
  5. «Punta desde imagen…» con un círculo;
  6. renombrar, borrar y exportar;
  7. al recargar sigue todo, con los mismos ids.

  Falla sin el módulo nuevo.
- **`check_brush_import_backend.py`** suma una prueba de la biblioteca propia: se guarda, se lista, se exporta y se reinstala igual, y no puede pisar una biblioteca incluida ni usar nombres de archivo peligrosos.
- **`check_brush_vector_import_ui.js`**: la copia retocada ahora se busca en Mis pinceles, que es su nuevo lugar.
