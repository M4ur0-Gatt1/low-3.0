# LOW 3.33.0 — El generador de elementos, la escenografía, todo sobre el terreno y del 3D a la multiplano

Pedidos de Mauro:
- «falta el generador: que yo pueda dibujar las piezas 3D e ir armando el kit… investigá cómo se le dice en una producción de animación»;
- «las cajas no las estoy pudiendo hacer… no funciona en toda la cuadrícula… ¿o porque tenía terreno?»;
- «todas las herramientas deben poder trabajar en los terrenos, también en los lagos»;
- «falta el flujo para usarlo en la mesa multiplano del módulo 2D».

## Arreglo: las cajas en toda la cuadrícula y sobre el terreno

Eran dos defectos:
- **El piso lejano.** El estudio rechazaba el piso donde un píxel de pantalla cubre más de medio metro; esa regla es para que el dibujo no salte. Con la cámara a la altura de los ojos, más allá de unos 23 m el piso «no existía» para la caja. Ahora colocar (cajas, elementos, calles) acepta el piso lejano, y el dibujo conserva su regla.
- **Las laderas.** La caja exigía tocar algo casi perfectamente horizontal, así que sobre cualquier ladera no salía. Ahora acepta laderas (no barrancos): la base queda horizontal, apoyada en lo más bajo del terreno debajo de ella, y el techo a la altura que marcaste.

Los elementos de la biblioteca también se asientan en lo más bajo y no flotan del lado de la pendiente.

## Biblioteca de escenografía

Usamos los nombres de teatro, cine y animación:
- lo que era un «kit» es una **Escenografía**, cada una con su estilo;
- cada «pieza» es un **Elemento**, con categorías **Casas, Edificios, Árboles, Plantas, Ambientación** (faroles, bancos), **Rocas** y **Utilería**.

## El generador de elementos

- **«+ Nuevo elemento»:** nombre y categoría, y después «Dibujarlo». La mesa queda vacía para dibujar el elemento con **todas** las herramientas: dibujo, figuras, cajas, volúmenes. Tu escena espera afuera, intacta.
- **Las cajas de un elemento** se guardan como **volúmenes macizos** del color con que las armaste: en la escena son andamio, en un elemento son cuerpo.
- **«Guardar en la escenografía»:** el elemento queda en la biblioteca, con su miniatura, y volvés a tu escena como estaba, con su Ctrl+Z. Lo que salga de una escenografía de fábrica va a tu copia («… (mía)»).
- **✎ en cada elemento:** lo abre en el editor para cambiarlo. «Cancelar» vuelve sin tocar nada.
- Mientras editás, el autoguardado sigue guardando tu escena, no el elemento a medio hacer.

## Todo sobre el terreno y el agua

- **Calles sobre el relieve.** El camino sigue el terreno: su eje toma la altura del suelo cada 3 m, suavizada. El terreno se nivela debajo de la calzada y las veredas, y se funde con el original en una banquina. Un Ctrl+Z saca la calle y la nivelación.
- **El agua es superficie.** Se dibuja y se apoya sobre el espejo de un lago o la cinta de un río; antes caía al fondo.
- Dibujar, cajas, elementos, guías y figuras ya se apoyaban en el terreno.

## Del 3D a la cámara multiplano del 2D

En **Toma**, abajo de «Mandar este encuadre al 2D»: **En planos (2 a 6)** → **Mandar en planos**.

- Lo que se ve se parte por distancia a la cámara, con planos más finos cerca. Cada plano se renderiza sólo con lo que cae entre sus dos distancias, así el terreno y lo que cruza profundidades queda repartido.
- En el 2D llega una capa por plano, al fondo, del más lejano (abajo) al más cercano.
- Cada capa lleva su **profundidad para la cámara multiplano**. El plano de acción es el punto adonde mira la cámara 3D. Al panear o acercar la cámara del 2D, lo lejano se mueve menos y lo cercano más.
- Volver a mandar reemplaza esas capas. Ctrl+Z las saca.
- Los planos van como archivos al lado del .low, igual que los fondos de las tomas.

## Pruebas

- **`check_3d_editor_elemento_ui.js`** (nueva). Comprueba:
  - una escena con dos cajas y un trazo; nuevo elemento «Kiosco»; mesa vacía;
  - una caja y un trazo dibujados con el mouse, y el autoguardado guardando la escena y no el elemento;
  - al guardar vuelve la escena entera con su Ctrl+Z, y el elemento queda en tu copia con la caja como volumen macizo;
  - colocarlo, y editarlo y cancelar.
- **`check_3d_multiplano_ui.js`** (nueva). Comprueba:
  - 3 planos (profundidades 161, 10 y −55) al fondo y en orden, ninguno vacío;
  - con la cámara del 2D corrida, el plano cercano se mueve en pantalla más de seis veces que el lejano;
  - volver a mandar reemplaza, y los dos Ctrl+Z funcionan.
- **`check_3d_cajas_ui.js`:** una caja a 40 m y una caja en una ladera de 34°. Fallaba antes del arreglo.
- **`check_3d_terreno_ui.js`:**
  - un trazo sobre el lago queda en el espejo de agua;
  - una calle que cruza la ladera sigue el relieve y deja el terreno nivelado al perfil (±6 cm);
  - Ctrl+Z saca la calle y la nivelación juntas.
- **`check_3d_biblioteca_ui.js`:** con los nombres nuevos.
- La puerta completa: de 203 pruebas, 192 pasan, 10 fallan por carga y pasan solas, y `check_reproduccion_fluida_ui` falla en esta máquina y pasa en GitHub, como en las versiones anteriores.
