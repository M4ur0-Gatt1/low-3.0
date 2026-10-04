# LOW 3.3.0 — máscara de recorte y tono/luz

Primer paso de la composición estilo Harmony: el equivalente del **Cutter** y del **Tone / Highlight**, como propiedades de capa. Lo que se ve en el lienzo es lo mismo que sale en el export: PNG, GIF, MP4, la cámara de composición y el storyboard.

## Máscara de recorte

En el botón de propiedades de una capa (el de los deslizadores, en la línea de tiempo) está **«Recortar con la de abajo»**.

- La capa recortada se ve **solo donde hay dibujo en su base**: la capa de abajo más cercana que no está recortada. Sirve para pintar sombras, brillos o texturas sin salirse del personaje.
- Se pueden apilar varias capas recortadas sobre la misma base, como en Photoshop.
- Si la base está oculta o vacía en ese cuadro, lo recortado tampoco se ve.
- En la línea de tiempo, las capas recortadas aparecen con **↳** delante del nombre.

## Tono / luz

En el mismo panel, **«Tono / luz»** convierte el dibujo de la capa en una silueta, o *matte*.

- **Sombra** oscurece lo que tiene abajo (multiplicar).
- **Luz** lo aclara (trama).
- Tiene **color**, **intensidad** y **borde suave**.
- El color con que dibujes el matte no importa: solo cuenta su forma.

## «＋ Sombra encima» y «＋ Luz encima»

Desde el panel de la capa del personaje, un solo botón crea la capa de sombra o de luz encima, ya recortada y con su tono. Dibujás las formas de la sombra y oscurecen solo al personaje. Es un solo paso de historial: Ctrl+Z la saca entera.

## Arreglado: los botones de Composición no respondían

En la pantalla **Composición**, ningún botón de la barra de arriba hacía nada: Perspectiva, Frente, Arriba, Cámara, Grid, Snap, Centrar, Auto-key ni Escalonar Z. Los campos del inspector (X, Y, Z…) tampoco tomaban el clic.

- **La causa**: la mesa de Composición vive adentro del lienzo de dibujo, y el lienzo se quedaba con cualquier clic que no fuera de uno de sus paneles, como si fuera a seleccionar o dibujar. El botón recibía cuando apretabas, pero el clic se lo llevaba el lienzo. Ahora el lienzo deja pasar los clics de la mesa de Composición.
- La prueba anterior no lo veía porque apretaba los botones desde el código y no con el mouse.

## Arreglado: la vista Cámara se veía vacía

Al apretar **Cámara** aparecía un rectángulo blanco sin nada. La escena estaba, pero se dibujaba más abajo, fuera de la vista: el recuadro se achicaba de ancho pero no de alto. Ahora la toma se ve entera, con la proporción de la escena.

## Arreglado: Enter no confirmaba los valores del inspector

Al escribir un valor (por ejemplo X = 250) y apretar Enter, el plano se movía en la mesa, pero el valor recién se guardaba en el documento al salir del campo. Si guardabas con Ctrl+S sin salir, se perdía. Ahora Enter lo confirma, con su paso de historial.

## Pruebas

- **`check_recorte_tono_ui.js`** (nueva) mide **colores de píxeles**, en el lienzo (captura de pantalla) y en el export (el cuadro rasterizado). Verifica que:
  - el azul recortado se ve dentro del personaje y no afuera, tanto con la capa recortada activa como con otra capa activa;
  - la sombra oscurece solo la mitad que tapa el matte, sin que se vea el color del matte ni se salga del personaje;
  - la luz aclara;
  - nada de esto queda guardado dentro del dibujo;
  - Ctrl+Z deshace todo.
- **`check_composicion_botones_ui.js`** (nueva) aprieta con el **mouse real** cada botón de la barra de Composición y comprueba que haga lo suyo. También cubre el lápiz activo, sin que quede ningún trazo, y verifica que:
  - el campo X toma el clic y Enter confirma el valor;
  - la vista Cámara muestra la toma entera y en proporción.

  Contra la versión anterior falla en «Frente», en Enter y en la vista Cámara, igual que lo que se veía.
- **`run_undo_estado_tests.js`** (58 casos) suma:
  - recortar;
  - dar tono;
  - que un tono inválido no se guarde;
  - «＋ Sombra encima» en un paso;
  - que guardar y abrir conserve el recorte y el tono.
