# LOW v3.29.48 — El rig se entiende y agarra la pieza correcta

El sistema de rigging tenía todo lo que hace falta —piezas, huesos, FK, IK,
claves— pero no se entendía de mirarlo, y el gesto más importante estaba roto.
Esta versión arregla cuatro cosas y mete el tutorial adentro del programa.

## El auto-vínculo agarraba la pieza equivocada

Al crear un hueso, LOW busca qué dibujo tiene debajo para que ese hueso lo
mueva. Lo resolvía con `dzRigArtAtPoint`, que recorría las piezas **en orden de
dibujo** y devolvía la primera cuyo **rectángulo envolvente** contenía el punto.

En un personaje eso falla casi siempre: la primera pieza suele ser el cuerpo, y
su rectángulo cubre al bicho entero. Los huesos que ponías en la pata, en la
oreja o en la mano quedaban vinculados al cuerpo. De ahí la sensación de que el
esqueleto "no mueve lo que tiene que mover".

Ahora mira la **tinta real** bajo el punto con `elementsFromPoint`, así que un
hueco del dibujo ya no cuenta como parte de la pieza. Si el punto cae en un
hueco, elige la **caja más chica** que lo contenga —la más específica—, nunca la
primera del documento.

Medido: un cuerpo de 400×400 con una mano de 60×60 encima. Apuntando al centro
de la mano, el código viejo devolvía `cuerpo` y el nuevo devuelve `mano`.

## La mesa ya no se llena de puntos

Registrar las piezas de un personaje deja un pivote por pieza encima del dibujo
—en un personaje real, decenas—, y no se ve nada. Ahora, cuando hay más de ocho
nodos, los que no son el seleccionado ni su familia directa se **atenúan** y se
achican. Siguen estando y se agarran igual de fácil: el área invisible de agarre
no cambió.

## Dos nombres que decían lo mismo y eran cosas distintas

En el panel del esqueleto, **Vínculo** era el padre jerárquico y **Vincular
dibujo** era qué arte arrastra el hueso. Son dos conceptos que en Harmony ni se
rozan. Ahora se llaman **Cuelga de** y **Mueve el dibujo**.

## La pieza conserva su nombre

Al crear un hueso sobre una pieza sin nombre, la pieza adoptaba el del hueso: el
dibujo pasaba a llamarse `hueso_12` y ya no se distinguía de su esqueleto. Ahora
recibe nombre de pieza (`pieza_3`).

## El tutorial vive adentro del programa

**Ayuda → Cómo se riggea un personaje** abre el instructivo completo: que las
piezas y los huesos son la misma entidad, los dos caminos para armar, cómo se
posa en FK y en IK, qué es cada símbolo de la mesa, y la traducción para quien
viene de Harmony o de OpenToonz —donde la jerarquía se arma en la línea de
tiempo y acá se arma en la mesa, que es el paso que nadie encuentra.

La versión larga, con el detalle técnico y lo que sigue pendiente, quedó en
`docs/2D_RIG_TUTORIAL.md`.

## Lo que sigue abierto

- **Piezas y huesos comparten lista y símbolo** pero se posan distinto: el
  nodo-pieza no tiene cuerpo que agarrar, solo su articulación, y nada en
  pantalla lo dice.
- **La jerarquía entre huesos no se lee de un vistazo.** Entre una pieza y su
  padre el overlay sí dibuja la línea; entre un hueso y su padre no, porque esa
  línea ya está ocupada dibujando el cuerpo del hueso.
