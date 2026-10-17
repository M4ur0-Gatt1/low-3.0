# LOW 3.34.0 — El estudio 3D con la lógica de Feather: nunca se dibuja en la nada

Pedidos de Mauro:
- «la estética de la interfaz quiero que se parezca más a Feather en la lógica de uso, no tanto a SketchUp»;
- «no debe dibujar en la nada porque no sabe dónde está, se enloquece: debe dibujar sobre el piso o sobre alguna guía o sobre algún objeto o elemento… los elementos de la biblioteca deben funcionar como las superficies guía; siempre tengo que usar alguna referencia».

## Siempre sobre algo que se vea

Así funciona Feather: el trazo vive **sobre** una superficie (la guía, la imagen o el modelo en modo dibujar) y no se puede dibujar fuera de sus bordes. LOW 3D ahora hace lo mismo con el lápiz y las figuras.

- **Dónde se apoya.** El trazo arranca sobre lo que hay bajo el cursor:
  - el piso o el terreno;
  - el agua;
  - una guía o un plano de Guías;
  - la cara de una caja;
  - un elemento de la escenografía;
  - un trazo ya hecho.
- **Hasta dónde llega.** Si la punta sale de esa superficie, deja de dibujar, como si levantaras el lápiz. Antes el trazo seguía de largo por un plano infinito e invisible:
  - el de la guía;
  - el de la cara de la caja;
  - el plano tangente del primer punto sobre un elemento.

  Por eso podía irse «en cualquier dirección».
- **Los elementos son superficies.** Sobre una casa o un edificio de la escenografía el trazo recorre su cuerpo, como sobre una guía curva. Pasa de la pared al techo y queda un pelo afuera, para que la línea no se hunda en el volumen.
- **En la nada no se dibuja.** En el cielo, o de frente y de costado sin guía, el trazo no arranca. El aviso dice qué hacer: dibujar sobre algo, o crear una guía con G.
- **El cursor avisa antes de apretar.** Sobre un apoyo, el anillo es entero. En la nada, el anillo es punteado y rojo, y el puntero es de prohibido.
- **Sin dibujo en el aire.** La herramienta «Dibujo libre» (tecla F), que dibujaba a una profundidad elegida con la rueda, ya no está.
- **Crear guías no cambia.** Como en Feather, la guía se dibuja de frente a la cámara. Mover y editar lo ya hecho tampoco cambia.

## La interfaz con la lógica de Feather

- **Arriba a la izquierda:** el sistema (volver, proyecto, guardar, tema, ayuda).
- **Arriba a la derecha:** las herramientas en íconos. Construir agrupa caja, calles, elementos, terreno, río y lago.
- **Debajo de las herramientas:** las pestañas del panel Escenario (Escenografía, Escena, Guías, Cámara, Toma, Pincel).
- **A la izquierda:** el pincel (color, tamaño y opacidad en vertical), las rectas a los ejes y deshacer/rehacer.
- **Abajo al centro:** las opciones de la herramienta activa.
- **Abajo a la derecha:** las vistas.

## Pruebas

- **`check_3d_apoyo_ui.js`** (nueva). Con el mouse de verdad, comprueba:
  - un trazo que arranca en un plano de Guías, en un elemento (casa) o en la cara de una caja y sigue de largo no deja ningún punto fuera de lo que se ve;
  - un trazo del piso llevado hasta el cielo queda en el piso;
  - arrastrar en el cielo no dibuja, y el cursor lo avisa antes de apretar (y sobre el piso no);
  - la tecla F ya no activa el dibujo en el aire.

  Fallaba antes del arreglo en los seis puntos que cambian.
- **`check_3d_studio_ui.js`:** la paleta ya no ofrece el dibujo libre, y el trazo de prueba va sobre el piso desde Arriba.
- **Pruebas que pedían dibujar en la nada,** ahora con la regla nueva:
  - **`check_3d_cajas_ui.js`:** al cruzar la arista, el trazo llega al borde y termina. Antes seguía por el plano de la cara.
  - **`check_3d_cierre_ui.js`:** se dibuja sobre la guía movida, donde está. Lejos de ella, su plano infinito no recibe el trazo.
  - **`check_perspectiva_3d_dibujo_ui.js`:** de Frente sin nada no se dibuja; con un plano de Guías, sí.
  - **`check_3d_superficie_curva_ui.js`:** el trazo arranca sobre cada superficie, no al costado.
