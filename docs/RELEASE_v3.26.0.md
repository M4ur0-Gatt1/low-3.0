# LOW 3.26.0 — Perspectiva para layouts en el estudio 3D, y «Mandar al 2D»

Pedido de Mauro: «que tire muchas líneas de punto de fuga ya predefinidos, con 1, 2 o 3; que se pueda cambiar el horizonte, girar la vista; que tenga esquemas para exteriores e interiores», vinculado al 2D. Y además: «nuevas líneas que siempre salgan exactamente desde el punto de fuga».

## En el estudio 3D: botón **Perspectiva**

Las líneas no se dibujan hacia un punto de la pantalla. Son **rectas paralelas en el espacio**, a lo largo de X, de Z y de la vertical, y la cámara las hace converger. Por eso, al subir el horizonte, inclinar o girar la vista, **todo sigue fugando exacto**: medido, cada recta pasa a 0,000 px de su punto de fuga.

- **Esquemas:**
  - **Calle** (exterior): calzada, veredas y fachadas con pisos y columnas.
  - **Manzana** (exterior): cuadras con edificios de distintas alturas alrededor de una plaza.
  - **Habitación** (interior): piso, paredes y techo cuadriculados, con una puerta y una ventana para tener escala.
  - **Sólo líneas**: un enrejado en los tres ejes.
- **1, 2 o 3 puntos de fuga**, como encuadres listos:
  - 1 punto: de frente, fuga sólo la profundidad;
  - 2 puntos: la vista girada, fugan las dos horizontales sobre el horizonte;
  - 3 puntos: afuera desde arriba, adentro desde abajo; fuga también la vertical.
- **Horizonte** (la altura de los ojos), **girar la vista**, **inclinación** y **lente**, de 14 a 135 mm. También se orbita con el botón derecho, y los controles siguen a la cámara.
- **Pocas o muchas líneas.** Cada eje tiene su color: X naranja, profundidad cian, vertical verde. El horizonte es amarillo y los puntos de fuga se marcan en pantalla con su abanico.
- Un **marco** muestra el cuadro del 2D, con su misma forma: lo que queda adentro es lo que va a salir.
- Se guarda con el proyecto `.low3d`. Un proyecto nuevo arranca de fábrica.

## «Mandar al 2D»

1. Las líneas, y lo que hayas modelado, se renderizan **del tamaño del cuadro del 2D**, con fondo transparente. Entran como capa de calco **«Layout 3D» al fondo**, expuesta en toda la escena. Volver a mandar **reemplaza** el layout, no apila capas, y es un paso de Ctrl+Z.
2. Los **puntos de fuga de la cámara** pasan a ser la perspectiva de la escena 2D. El lápiz se imanta exacto a las mismas rectas que se ven en el calco, y el horizonte se arma con los puntos horizontales, aunque la vista esté inclinada.

## En el 2D: «Líneas desde un punto»

En la barra de Perspectiva: clic en la mesa, por ejemplo en la esquina de una casa, y salen las **rectas de construcción de cada punto de fuga pasando exacto por ahí**, más la vertical. Es la forma clásica de levantar una caja en 2 puntos. Quedan como guía, no como tinta, se guardan con la escena y se borran con **Borrar líneas**.

Y el imán de la 3.25 ya hace que cada trazo salga exactamente desde el punto de fuga: queda sobre la recta que pasa por él.

## Arreglado en el camino

- **«Proyecto nuevo»** en el 3D conservaba el giro y los puntos de la perspectiva del proyecto anterior.
- **El layout no se veía en la mesa.** Al recibirlo, LOW rehacía el lienzo y borraba las capas de contexto recién pintadas. Lo encontró la prueba nueva.

## Pruebas

- **`check_perspectiva_3d_ui.js`** (nueva). Comprueba:
  - en el estudio:
    - los esquemas;
    - la exactitud de cada recta contra su punto de fuga, en 1, 2 y 3 puntos;
    - que con 1 punto se fugue al centro;
    - que en 2 puntos X y Z estén sobre el mismo horizonte, con la vertical vertical;
    - que el horizonte y el giro muevan la cámara y los puntos;
    - que se guarde y se abra igual;
  - dentro de LOW:
    - que el estudio reciba el tamaño del cuadro;
    - la capa de calco al fondo, con la imagen de 1920×1080 y expuesta en toda la escena, y que se vea en la mesa encima del papel sin colarse en el dibujo;
    - los mismos puntos de fuga en el 2D;
    - que volver a mandar reemplace;
    - que Ctrl+Z vuelva paso a paso.
- **`check_perspectiva_ui.js`**, ampliada con «Líneas desde un punto»: las rectas pasan por el punto y por cada punto de fuga, y marcar no dibuja. También con el horizonte que viene del 3D.
- Siguen pasando las del estudio 3D (`check_3d_studio_ui`, `check_3d_superficie_curva_ui`) y su prueba unitaria (`npm test`).
