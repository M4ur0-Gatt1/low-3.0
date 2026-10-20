# LOW 3.37.0 — El Taller de personaje y la biblioteca de maniquíes

Pedido de Mauro: «no quiero IA para eso; me gusta más hacer el modelo y girarlo en el módulo 3D… un módulo de diseño de personaje con todas las herramientas, al mejor estilo Grease Pencil… y una biblioteca de maniquíes distintos que también sirva para el módulo 3D de composición de fondos».

Sin IA. El personaje se dibuja en 3D sobre un maniquí y se gira de verdad. Las vistas salen de girar ese mismo dibujo, no de adivinarlas.

## El Taller de personaje (estudio 3D → panel «Personaje»)

- **Siete maniquíes de base**, por proporción en cabezas:
  - Chibi (2,5), Niño (4), Cartoon (5), Realista (7,5), Mujer, Heroico (8,5) y Estilizado (9).
  - Cada uno tiene cabeza, cuello, pecho, cintura, pelvis, brazos, antebrazos, manos, muslos, piernas y pies, en pose A.
- **Abrir el taller** aparta la escena: queda intacta y vuelve igual al guardar o cancelar.
- **Dibujar sobre el maniquí** con todas las herramientas del estudio (lápiz, cajas, espejo…).
  - Cada trazo que arranca sobre una parte **se pega a esa parte**.
  - Si después cambiás las proporciones, el pelo sigue a la cabeza y la manga al brazo.
- **Proporciones** con deslizadores:
  - alto en cabezas, hombros, cadera, brazos, piernas, grosor y ancho de cabeza;
  - el alto real en metros (la escala al ponerlo en un fondo) y el color.
  - Cada cambio es un paso de Ctrl+Z.
- **Vistas:**
  - Frente, 3/4, Perfil, 3/4 espalda y Espalda, más un deslizador **Girar** (el giradiscos).
  - **Líneas de modelo** rotuladas (coronilla, ojos, mentón, hombros, cintura, entrepierna, rodillas, tobillos, piso).
  - Opciones: Espejo y Maniquí transparente.
- **Guardar en la biblioteca:** el personaje queda en tu colección «Mis personajes», con su maniquí. Para seguir editándolo, se vuelve a abrir desde el panel o desde la Biblioteca.

## Al 2D

- **Mandar hoja de modelo:** las vistas elegidas lado a lado, sin perspectiva y con la misma escala, de modo que las líneas coinciden. Llevan su nombre y las líneas de modelo rotuladas. Llegan como una capa de referencia **«Hoja de modelo · Nombre»** al fondo, para calcar.
- **Mandar el giro en cuadros:** cada vista en un cuadro de la capa **«Giro · Nombre»**, para animar el giro.
- Opción **con o sin el maniquí**.
- Volver a mandar el mismo personaje reemplaza su capa, no apila otra. Ctrl+Z la saca.
- El personaje gira, así que el encuadre lo mide de costado en todas las vistas: los brazos abiertos no se cortan.

## La biblioteca de maniquíes

En la Biblioteca del estudio hay una colección nueva de fábrica, **«Maniquíes»**, con los siete. Se colocan en los fondos como cualquier pieza, para dar escala humana a una escena (el Realista mide 1,74 m).

## Lo que todavía no hace

- **Posar** al personaje (doblar codos y rodillas) queda para la próxima etapa.
- Un trazo dibujado con espejo sobre un brazo o una pierna sigue sólo al lado donde arrancó cuando cambian las proporciones.
- El panel del taller, como el resto del estudio 3D, está sólo en castellano. Lo que llega al 2D (capas y avisos) sí está en inglés y portugués.

## Pruebas

- **`check_3d_taller_personaje_ui.js`** (nueva):
  - abre el taller con cada maniquí;
  - dibuja sobre la cabeza con el mouse y comprueba que el trazo la sigue al cambiar las proporciones;
  - Ctrl+Z de las proporciones;
  - la hoja de modelo (vistas con tinta, nombres, líneas);
  - guardar en «Mis personajes» y volver a abrir;
  - la colección «Maniquíes» en la Biblioteca y colocar uno a escala.
- **`check_taller_hoja_2d_ui.js`** (nueva). Dentro de LOW, con los botones del taller:
  - la capa «Hoja de modelo · Personaje» de referencia con las cinco vistas, sus nombres y las líneas rotuladas, visible en la mesa;
  - el estudio recibe la confirmación;
  - la capa «Giro · Personaje» con una vista distinta por cuadro, del tamaño del cuadro del 2D;
  - volver a mandar reemplaza;
  - Ctrl+Z de a un paso.
