# LOW 3.20.0 — Acompañar el movimiento, y cortar / copiar / pegar objetos

## Acompañar el movimiento

Pedido de Mauro, con un video de una caminata: «si ya tengo un objeto animado, quiero agregarle otro objeto y que siga el movimiento… una función nueva, para no mezclar el agrupado, porque también sirve mover cada parte independiente… quiero que la cabeza acompañe al cuerpo».

Es el «parent» de After Effects o el peg de Toon Boom, pensado para dibujos cuadro a cuadro.

**Cómo se usa:**

1. En un cuadro donde están los dos, elegí la cabeza (o varias partes) y, con **Shift**, el cuerpo **al final**: el último que elegís es el que guía, como el objeto clave de Illustrator.
2. **Animación → Acompañar el movimiento** (o **Alt+P**).

**Qué pasa:**

- En cada cuadro de la capa donde está el cuerpo, la cabeza aparece **con el mismo avance, giro y escala** que el cuerpo respecto de ese cuadro.
- Siguen siendo **objetos separados**: en cualquier cuadro se puede retocar la cabeza sola. No es un grupo.
- **Volver a aplicarlo reemplaza** lo que puso antes; no duplica. También saca las copias quietas idénticas que hubiera, como las de Alt+D.
- **Animación → Soltar del movimiento** saca la cabeza de los otros cuadros.
- Todo es **un solo paso de Ctrl+Z**.

**Cómo encuentra al cuerpo en cada cuadro:**

- Si el cuerpo se animó copiándolo o interpolándolo, es la misma forma con otro desplazamiento: la cabeza hereda exactamente su movimiento.
- Si se lo redibujó a mano, la cabeza sigue su centro, sin giro, y el mensaje lo avisa.

## Cortar, copiar y pegar objetos

Pedido de Mauro: «el comando Ctrl+X no funciona para cortar… quiero que funcione con los objetos».

Hasta acá Ctrl+C copiaba siempre el cuadro entero, aunque hubiera objetos elegidos, y Ctrl+X no hacía nada. Ahora es como en Illustrator y Toon Boom:

- **Con objetos elegidos:**
  - **Ctrl+C** los copia;
  - **Ctrl+X** los corta, en un solo paso de Ctrl+Z;
  - **Ctrl+V** los pega **en el mismo lugar**, en el cuadro y la capa donde estés. Cortar en un cuadro y pegar en otro no corre nada, que es lo que sirve para animar. Cada objeto vuelve a su plano (Línea o Color) y quedan elegidos, listos para mover. Si estaban movidos, girados o dentro de un grupo, se pegan donde se veían.
- **Sin nada elegido**, Ctrl+C sigue copiando el cuadro entero y Ctrl+V pega lo último que copiaste.
- También están en **Edición → Cortar · Copiar · Pegar en el mismo lugar**.
- Si lo último que tocaste fue la línea de tiempo o la X-sheet, Ctrl+C/X/V siguen siendo de las celdas.

## Insertar un cuadro: ahora después, como dice

Apareció al probar cortar y pegar. En un `.low`:

- **Alt+N** («cuadro vacío **después** del actual») lo insertaba **antes**: el dibujo actual se corría adelante y quedabas parado en la celda vacía. Ahora lo inserta después y te lleva a él.
- **Alt+I** («insertar **copia** de este cuadro justo después») re-exponía el **mismo** dibujo: retocar uno cambiaba el otro. Ahora es una copia de verdad, después, y quedás en ella.

## Pruebas

Las tres fallan con la versión anterior.

- **`check_acompanar_ui.js`** (nueva) reproduce el video con el ratón de verdad: un cuerpo que avanza y se inclina en 5 cuadros, uno redibujado, y la cabeza sólo en el primero. Comprueba:
  - que la cabeza acompaña el avance y la inclinación;
  - que sigue el centro en el cuadro redibujado;
  - que aplicarlo otra vez no duplica;
  - Ctrl+Z;
  - Soltar.
- **`check_cortar_pegar_ui.js`** (nueva) comprueba:
  - un marco más Ctrl+X, y Ctrl+Z los devuelve;
  - Ctrl+V en otro cuadro los pega en el mismo lugar, elegidos y guardados;
  - Ctrl+C de un objeto no copia el cuadro;
  - sin nada elegido, Ctrl+C copia el cuadro.
- **`check_insertar_cuadro_ui.js`** (nueva) comprueba que Alt+N inserta un cuadro vacío después y que Alt+I inserta una copia independiente después.
