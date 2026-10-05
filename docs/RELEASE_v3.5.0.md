# LOW 3.5.0: pinceles de mejor calidad, que siguen la mano y se ven mientras dibujás

Pedido de Mauro: «no los veo bien a los pinceles: falta más precisión y mejores efectos». Esta es la primera de tres entregas. Las próximas traen importadores reales de Photoshop, Procreate, Krita y GIMP, y bibliotecas de pinceles.

## El trazo sigue la mano: las esquinas quedan en punta

**Medido en la app real:** una V aguda dibujada con el lápiz salía como una U y se separaba **hasta 8 px** del recorrido del lápiz. La curva del trazo pasaba por la punta como si fuera redonda.

Ahora, donde el trazo dobla más de 65°, la esquina queda en punta. **La misma V queda a menos de 1 px.** Las curvas suaves no cambian.

Los pinceles también siguen esa curva. Antes unían los puntos con rectas, y en un trazo grande se notaban facetas.

## Los pinceles con textura se pintan como en Photoshop o Procreate

Antes, un pincel raster eran hasta 1600 círculos SVG: el carboncillo parecía un collar de bolitas. Ahora cada trazo se **sella en una imagen de alta resolución** con una punta de verdad:

- **Carboncillo, tiza, pastel:** cuerpo macizo con el borde irregular. El grano lo pone el **papel**, con motas chicas fijas en la hoja: dos trazos que se cruzan comparten el grano.
- **Pincel seco:** una fila de **cerdas** que gira con el trazo, así que las vetas siguen la dirección del pincel y se cortan como pintura seca.
- **Óleo sobre lienzo:** trama de tela.
- **Destellos, pasto, hojas, confeti, rayado y puntillismo:** sus formas, con su halo en el caso de los destellos.
- **Pinceles importados:** se estampa la imagen de su punta.

El trazo entra al dibujo como una máscara con el color encima, así que **la paleta lo sigue recoloreando**. Pesa más o menos lo mismo que los círculos de antes: un trazo grande de carboncillo ocupa unos 130 KB.

Para **seleccionar** un trazo de mapa de bits se mira dónde tiene tinta: un clic sobre lo pintado lo selecciona y un clic en el hueco de su caja no.

## Lo ves mientras dibujás

Antes, mientras arrastrabas se veían rayitas finas y el pincel de verdad aparecía recién al soltar. Ahora ves el pincel real desde el primer momento:

- **pinceles raster:** sus sellos, con la punta, el color y el grano;
- **pinceles vectoriales:** su contorno, con la presión, los remates y la textura o el brillo.

## Mejores efectos

- **Neón:** un tubo encendido. El núcleo es una tinta clara del mismo color, no blanco, y tiene un halo de color y un halo lejano tenue. Viene en celeste.
- **Brillo suave** (naranja cálido) y **Destellos** (dorado) traen su color.
- **Pasto:** más denso, con hojas más anchas y verde. **Hojas:** en verdes que varían.
- **El halo no se corta.** En un trazo largo y angosto, el brillo terminaba en un borde recto. Ahora la región del efecto se calcula en unidades del dibujo.

## Pruebas

- **`check_pincel_vivo_ui.js`** (nueva) usa el lápiz de verdad y verifica que:
  - mientras se dibuja con carboncillo, la capa en vivo tiene tinta justo donde pasó el lápiz y está dentro del área de dibujo;
  - al soltar, la capa en vivo se va y el trazo queda como **una** imagen, sin círculos;
  - la paleta recolorea ese trazo;
  - el lápiz grafito muestra en vivo su contorno con textura;
  - una V aguda queda a menos de 3 px del recorrido (antes 7,9).

  Contra 3.4.0 falla en lo primero: no había vista en vivo.
- **`run_trazo_tests.js`** suma «la V queda en punta» y «el pincel sigue la misma curva, sin facetas».
- **`check_pinceles_ui.js`** y **`check_brush_vector_import_ui.js`** ahora exigen que los pinceles raster pasen por el mapa de bits.
