# LOW 3.36.2 — Las imágenes importadas y los recuadros de selección

Reporte de Mauro, con capturas, mientras calcaba una imagen importada: «hace cosas rarísimas con los cuadros de selección de los objetos o imágenes… no respeta la posición ni la escala… cambia con el zoom de pantalla… es inmanejable… se desfasa de la cámara y la mesa de trabajo… lo cerré y sigue apareciendo abajo».

## Lo que se midió

Con una imagen vertical importada y con la escena de Mauro abierta en el entorno de prueba:

1. **La imagen importada no tenía alto.** LOW le ponía el ancho (el 80% de la hoja) pero no el alto. Chrome la dibuja igual, con su proporción, y una imagen vertical medía 3584 de alto en una hoja de 1080: enorme, saliéndose de la hoja, con la esquina de escalar fuera de la pantalla. Las cuatro imágenes de la escena de Mauro estaban así.
2. **El recuadro de transformación se medía antes de que cargara la imagen,** y nacía con 2 px de alto.
3. **El marco de selección («1 pieza») sólo se redibujaba al elegir algo.** Al mover, escalar, hacer zoom (Alt+rueda, Z), girar la mesa o deshacer, quedaba en el lugar viejo.
4. **La mesa se desplazaba por su cuenta.** Cuando la hoja no entraba (zoom grande, o la imagen enorme), el lienzo se desplazaba con la rueda. La hoja se movía con él, pero el marco de la cámara, el recuadro de transformación y la imagen del play se ubicaban desde el borde visible. Al recalcularse quedaban corridos justo lo desplazado: con 160 px, la hoja se movía 160 y el marco de la cámara 320. Las capturas mostraban unos 170 px («la cámara y la mesa están súper lejos»).
5. **Al cerrar la última escena,** la hoja del documento cerrado, con su imagen, y los recuadros de selección y de cámara seguían en la mesa, debajo de la invitación.

## Los arreglos

- **Al importar,** la imagen entra entera en el 80% de la hoja, centrada, con su proporción y con su alto escrito. El recuadro la abraza de entrada.
- **Las imágenes que ya estaban sin alto** reciben, al aparecer en la mesa (abrir, cambiar de cuadro, deshacer), el alto con que ya se veían. Lo que se ve no cambia; se arregla lo que mide el recuadro.
- **El marco de selección acompaña** al recuadro de transformación: mover, escalar, girar, hacer zoom.
- **La mesa ya no se desplaza.** La rueda, sin Alt, la mueve con el paneo, igual que la mano o Espacio+arrastrar; con Shift, de costado. Cualquier desplazamiento que intente el navegador se convierte en paneo en el acto. La hoja y todo lo de encima se mueven juntos.
- **Sin documento, la mesa queda vacía:** la hoja del documento cerrado y los recuadros se esconden hasta abrir otro.

Ojo en el espacio **Cámara**: arrastrar dentro del marco naranja mueve **la cámara**, no la imagen. En una de las capturas, la barra decía «Mover la cámara · cuadro 9».

## Pruebas

- **`check_imagen_importada_ui.js`** (nueva). Con el mouse de verdad, comprueba:
  - una imagen vertical entra entera, con su proporción y su alto, y el recuadro la abraza;
  - al moverla, el marco la sigue;
  - la esquina para escalar queda en pantalla y escala proporcional, con marco y recuadro detrás;
  - con zoom siguen coincidiendo;
  - una imagen vieja sin alto lo recibe (800 × 300/400 = 600);
  - al cerrar, la mesa queda vacía, y al abrir otra escena la hoja vuelve.

  En la 3.36.1 falla en el primer paso.
- **`check_mesa_desplazada_ui.js`** (nueva). Con zoom ×3 y la rueda de verdad, comprueba:
  - el lienzo no queda desplazado;
  - el marco de la cámara coincide con la hoja y el recuadro con el objeto;
  - un desplazamiento del navegador también se vuelve paneo;
  - reproduciendo, la imagen del play queda sobre la hoja.

  En la 3.36.1 falla: el lienzo quedaba desplazado 160 px.
- **La escena real de Mauro** (con sus cuatro imágenes sin alto): abierta en el entorno de prueba, el recuadro coincide con la imagen en los cuatro cuadros, tras Alt+rueda, con la mesa girada y tras Z. El marco de la cámara coincide con su rectángulo con la mesa girada −29°.
