# LOW 3.35.0 — Unir puntas, el clic derecho del lápiz abre el pincel y el suavizado en %

Pedidos de Mauro:
- «quiero que se pueda configurar el pincel de tal manera que al tocar dos puntas, dos extremos de línea, las líneas se unifiquen; es algo que se puede activar o desactivar en la herramienta»;
- «quiero que el clic derecho del lápiz de la tableta muestre las opciones de pincel o del lápiz: el suavizado, el espesor y la presión; quiero poder desactivar, activar o variar la presión del pincel»;
- «el dial de suavizado no muestra el porcentaje; quiero que muestre el valor».

## Unir puntas

Botón **«Unir puntas»** en la barra del Lápiz y del Pincel (también en el panel del clic derecho del lápiz). Viene apagado y se recuerda.

Con la opción prendida, al soltar un trazo:
- **Continuar:** si empieza o termina en la punta de otra línea, la continúa y queda una sola línea.
- **Unir dos líneas:** si toca las puntas de dos líneas, quedan las tres en una.
- **Cerrar:** si va de una punta a la otra de la misma línea, la cierra.

Qué se une con qué:
- Sólo líneas del **mismo tipo** (lápiz con lápiz, pincel con pincel), del mismo color y, en el pincel, del mismo pincel, y en la misma capa. Unir una tinta con un lápiz rojo cambiaría cómo se ve lo que ya estaba.
- La línea que ya estaba pone el estilo.
- «Toca» quiere decir a menos de 8 píxeles de pantalla, o de 0,6 grosores si la línea es gruesa.
- Una línea movida con la Flecha también se une donde se la ve.

Es un solo paso de Ctrl+Z, junto con el trazo. Para poder unirse, el Lápiz ahora guarda los puntos de cada línea, como ya hacía el Pincel.

## El clic derecho del lápiz abre el pincel

Con el Lápiz o el Pincel elegidos, el **botón lateral del lápiz** abre ahí mismo un panel chico. Funciona con la punta apoyada o en el aire.

- **Espesor y Suavizado:** son los mismos valores de la barra y del inspector.
- **Presión, prendida o apagada:** prendida, el trazo engorda y adelgaza con la mano; apagada, es el «Ancho fijo» de siempre.
- **Variación de presión:** de 0 % (nada) a 200 % (el doble de lo que trae el pincel); 100 % deja el pincel como viene. Se guarda con cada trazo, así que repintarlo no lo cambia.
- **Unir puntas.**
- **Con el Lápiz,** la presión aparece apagada y el panel lo explica: el Lápiz traza parejo.
- **Cerrarlo:** con Esc o tocando afuera.

**Cuándo es el lápiz y no el mouse.** Según el controlador, Windows manda el botón lateral como clic derecho del mouse. Por eso se reconoce también si el clic cae donde el lápiz estaba flotando hace menos de 600 ms.

**Lo que no cambia:**
- El clic derecho del mouse sigue abriendo el menú de siempre.
- La pulsación larga durante un trazo, o justo después, sigue descartándose.

Además, el botón derecho ya no dibuja con el Lápiz ni el Pincel: antes, el botón lateral con la punta apoyada hacía un trazo.

## El suavizado en %

- **El valor en %:** el suavizado se lee como porcentaje («40 %») en la barra, en el inspector y en Preferencias.
- **La barra a media pantalla:** la barra del Lápiz y del Pincel no entraba y dejaba fuera de la vista el dial del suavizado, su valor y «Unir puntas». Para que entre, en ventanas angostas:
  - el nombre de la herramienta (está en la barra de abajo) y las palabras «Pincel» y «Trazo» se ocultan;
  - el menú de pinceles y el dial se achican;
  - «Pinceles…» pasa a ser un ícono y «Unir puntas» dice «Unir».

  Todo conserva su descripción al pasar el mouse.

## Pruebas

- **`check_unir_puntas_ui.js`** (nueva). Con el mouse de verdad, comprueba:
  - apagado no se une;
  - el botón lo prende y se recuerda;
  - un trazo continúa una línea;
  - un trazo une dos líneas en una, de punta a punta;
  - Ctrl+Z las separa;
  - otro color no se une;
  - en el Pincel, la línea unida tiene todos los puntos.

  En la 3.34.0 falla: el lápiz no guardaba sus puntos.
- **`check_pincel_rapido_ui.js`** (nueva). Con el lápiz simulado, comprueba:
  - el botón lateral abre el panel donde está la punta, sin dibujar y sin menú;
  - espesor y suavizado van a la barra y al inspector;
  - presión apagada da ancho fijo;
  - la variación al 50 % queda guardada en el trazo (0,41 sobre 0,82);
  - Esc lo cierra y el clic derecho del mouse sigue con su menú;
  - con el Lápiz, el panel dice «Lápiz» y la presión aparece apagada;
  - el clic que llega como del mouse, con el lápiz flotando, también abre el panel;
  - a 1000×560 el suavizado y su «40 %» se ven en la barra.

  En la 3.34.0 falla.
- **`check_pulsacion_larga_ui.js`:** el botón lateral en el aire ahora abre el panel del pincel (antes, el menú).
