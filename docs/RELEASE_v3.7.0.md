# LOW 3.7.0 — La portada dice qué es LOW, y la mesa de trabajo es una mesa de animación

Pedido de Mauro: «la filosofía no está tan clara al abrir el módulo de animación… se ve algo impersonal, una descripción muy básica» y «que la rotación de la mesa de trabajo y su estética remitan a la clásica mesa de animación 2D, como tienen OpenToonz o Toon Boom».

## La portada del módulo 2D

Antes decía «Dibujo cuadro a cuadro, X-sheet, esqueletos, cámara y multiplano». Ahora cuenta de dónde sale LOW:

- **La marca** con el rayo partido, naranja y celeste, y el lema: *«Un lado de canciones, un lado de paisajes»*.
- **Dos párrafos.** El primero cuenta el nombre: *Low*, el disco que David Bowie publicó en 1977, grabado entre Francia y Berlín. Lo hizo un músico que también era actor, mimo y pintor. El segundo, la idea: **no elegir un solo oficio**. En un mismo programa dibujás, animás cuadro a cuadro, armás esqueletos, filmás con cámara multiplano y pasás al 3D.
- **Lado A y lado B.** El lado A es para empezar: un documento nuevo o lo que quedó sin guardar. El lado B es para seguir: abrir un documento o elegir uno de los recientes.
- Detrás de la tarjeta está **el disco de la mesa**, girando muy despacio.

Si la ventana es baja, la portada empieza por la marca y el resto se recorre con la rueda. Antes, la tarjeta centrada perdía el encabezado arriba y no había forma de llegar a él.

## La mesa de animación

El área de trabajo es ahora una mesa de animación clásica:

- **Un tablero oscuro** con **un disco de vidrio iluminado desde abajo** debajo de la hoja.
- El disco tiene **un aro de metal graduado**: una marca cada 5° y números cada 30°.
- **Una regla de pernos** al pie de la hoja: un perno redondo al centro y dos planos a los lados, como la regla Acme.
- **El índice naranja** de la mesa, que queda fijo y marca dónde está el cero.

**Girar es girar el disco.** La hoja, los pernos y el cuadro de cámara giran juntos; el dibujo no se toca. Se puede girar de cuatro maneras:

- **Con el dial** del rincón: arrastrás, la rueda lo mueve de a 5°, **Shift** de a 15° y el **doble clic** lo endereza por el camino corto (de 350° vuelve a 360°, no da la vuelta entera).
- **Con el aro** del disco, agarrándolo donde se ve.
- **Con las teclas `[` y `]`:** el disco gira en un cuarto de segundo, no salta. Si apretás dos veces seguidas, los giros se suman.
- **Con «Ajustar a pantalla»:** con la mesa prendida, deja ver el aro.

El aro y el dial no dibujan. El vidrio, en cambio, sí: **un trazo que empieza fuera de la hoja sigue dibujando** como siempre.

La mesa se apaga y se prende desde **Vista → Mesa de animación** o desde el botón del disco en la barra. LOW recuerda la elección.

## Arreglado de paso

- **El cuadro de la cámara no giraba con la hoja.** Al girar la vista, el marco naranja quedaba derecho mientras la hoja giraba, y dejaba de enmarcar lo que filma.
- **3.6.0:** la prueba de importación de pinceles usaba el contrato viejo del puente. Ahora usa el de las bibliotecas instaladas.

## Pruebas

**`check_mesa_animacion_ui.js`** (nueva) usa el mouse y el teclado de verdad. Comprueba que:

- la portada habla de Bowie, de 1977 y del oficio, tiene lado A y lado B, y muestra el disco;
- con un rescate y ocho recientes en 1366×705, la marca queda a la vista;
- el disco está debajo de la hoja, y con «Ajustar a pantalla» se ven 90° de aro;
- la mesa no deja ningún elemento SVG dentro del lienzo: varias partes de LOW reconocen el dibujo así, y los números de grados del disco pasaban por texto del dibujo (lo encontró la puerta). La mesa se pinta como imagen y el aro es un recorte;
- un cuarto de vuelta del dial gira la hoja 90°, el disco y el cuadro de cámara giran con ella, y el dibujo no cambia;
- Shift va de a 15° y la rueda de a 5°;
- el doble clic endereza por el camino corto;
- `]` y `[` giran animado y se suman;
- arrastrar el aro con el pincel gira el disco y no dibuja, y un trazo que empieza en el vidrio sí dibuja;
- Vista → Mesa de animación la apaga y la prende.
