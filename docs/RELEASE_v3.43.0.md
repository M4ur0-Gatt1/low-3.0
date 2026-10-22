# LOW 3.43.0 — El grosor del 3D como en el 2D, y lo de AutoCAD

Pedido de Mauro: «hay un problema con el espesor de las líneas en el módulo 3D: la línea en 1 es demasiado gruesa, no tiene los espesores como en el módulo 2D. También quiero que, si te parece que hay algún comportamiento de AutoCAD que se pueda copiar y sea útil a este sistema, lo sumes; tiene que ser el mejor programa estudio de animación del mundo, no te conformes con poco».

## El grosor del 3D, en píxeles como en el 2D

- **Medido antes:** el grosor 1 era un caño de 2,2 cm de diámetro, y el 100, de 26 cm. Sobre un personaje de 1,8 m, una línea de 1 se veía como una soga. El tipo decía «grosor en px», pero no lo era.
- **Ahora el grosor N mide N píxeles** en el momento de dibujar, a la profundidad donde arranca el trazo.
  - Medido: los trazos de 1, 6 y 20 miden 1, 6 y 20 px en pantalla.
- **Queda fijo en el mundo**, como la tinta sobre el objeto:
  - al acercar la cámara el trazo engorda, igual que al hacer zoom en el 2D (medido: de 6 a 11,6 px al acercar a la mitad);
  - a lo lejos se afina con la perspectiva, como en Grease Pencil.
  - Las figuras (rectángulo, círculo, polígono) también van en píxeles.
- **Mientras se dibuja, el trazo se ve con su grosor de verdad.** Antes era una línea de 1 px que recién al soltar mostraba el ancho.
- **El deslizador del grosor va de 0,5 a 100 px en escala logarítmica.** En el lineal de 1 a 100, los grosores finos de entintar (de 1 a 10) ocupaban la décima parte de abajo. Ahora el medio es unos 7 px.
- **Los trazos de antes se ven como siempre:** no tienen la medida nueva y usan la de antes.

## Lo de AutoCAD (en el 2D)

Se copió cómo trabaja AutoCAD, no su código. Los botones están en «Más herramientas» ⋯, junto al espejo y las paralelas.

### Referencias a objetos (F3 · «REFENT»)

- El lápiz, el pincel, la pluma y las formas **arrancan y terminan exacto** en estos puntos de otra línea:
  - el punto final, el punto medio, la intersección y el centro (de un círculo o del área de una forma cerrada);
  - la perpendicular, desde donde arrancó el trazo;
  - el más cercano (apagado de entrada, como en AutoCAD).
- **Las marcas de AutoCAD:** □ punto final, △ medio, ✕ intersección, ○ centro, ⊥ perpendicular, ⧗ cercano, con su nombre al lado, a 12 px del cursor (la «apertura»).
- Para animar sirve para **cerrar las formas**: el balde rellena a la primera.
- F3 las prende y las apaga. Con el clic derecho en el botón, o el comando «REFENT», se eligen cuáles valen (el cuadro de Parámetros de dibujo). Se recuerda.

### Desfase («O», «DESFASE»)

- Una copia paralela de lo elegido a la distancia pedida, en mm: «O 10» son 10 mm.
- Un clic dice de qué lado; con **Shift+clic**, de los dos.
- **Curvas:** la copia sigue la curva sin rulos en las vueltas cerradas.
- **Rectángulos y polígonos:** las esquinas quedan en punta, como en AutoCAD.
  - Medido: un rectángulo de 200 × 120 crece 5 mm por lado.
- Una línea de pincel se desfasa como pincel; una de lápiz, como lápiz.
- Un solo Ctrl+Z.

### Matriz («AR», «MATRIZ»)

- **Rectangular:** filas, columnas y separaciones en mm.
- **Polar:** la cantidad y el ángulo a cubrir, alrededor del centro de lo elegido o de un clic, girando cada copia (los rayos de una rueda) o sin girar (una ronda).
- **En trayecto:** lo elegido se reparte a lo largo de la última línea elegida, de punta a punta, alineado con el trayecto (postes de un alambrado, pisadas).
- Las copias quedan elegidas; un solo Ctrl+Z.

### Igualar propiedades («MA», «IGUALARPROP»)

- Lo elegido pasa su color, grosor, trazo y opacidad a cada cosa que se toque después. Esc o Enter termina.
- Entre una línea de pincel (cinta rellena) y una de lápiz pasa el color de línea.

### La línea de comandos

- La barra de abajo («Pedile un cambio a LOW…», Ctrl+K) entiende los comandos y sus alias **antes** de mandarle el texto a la IA:
  - O, DESFASE, OFFSET;
  - AR, MATRIZ, ARRAY;
  - MA, IGUALARPROP, MATCHPROP;
  - REFENT, OSNAP;
  - F3, PAR (paralelas), ? (la lista).
- **Enter con la línea vacía repite el último comando**, como en AutoCAD.
- Lo demás sigue yendo a la IA.

## Pruebas

- Nueva: `tools/check_3d_grosor_ui.js`:
  - el deslizador logarítmico;
  - los trazos de 1, 6 y 20 px en pantalla;
  - el trazo en vivo con su grosor;
  - fijo en el mundo al acercar;
  - los trazos de antes, como siempre.
- Nueva: `tools/check_autocad_ui.js`, con el mouse y el teclado de verdad:
  - F3 y la marca de «Punto final» sobre la punta;
  - arrancar en la punta, terminar en el medio, en la intersección y en la perpendicular;
  - F3 apaga;
  - «O 10» a 10 mm del lado del clic, Shift+clic de los dos lados, el rectángulo con las esquinas en punta;
  - las tres matrices;
  - igualar propiedades;
  - Enter vacío repite;
  - un pedido común no es un comando.
- `check_3d_editor_elemento_ui`: «apoyado en el piso» ahora se mide por lo más bajo de lo que se ve (queda en 0,000). Con el grosor en píxeles, el trazo del elemento tiene su radio y el elemento sube eso para no hundirse; el origen del objeto ya no decía si apoyaba.
- En la puerta local, `check_reproduccion_fluida_ui` sigue fallando en esta máquina, igual que con la 3.41: es el punto 2 de la fase 2 de [CAMINO_ESTABILIDAD.md](CAMINO_ESTABILIDAD.md).
