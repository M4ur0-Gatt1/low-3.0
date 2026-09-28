# LOW v3.29.62 — Riggear dibujando el alambre

Armar un muñeco era pieza por pieza: elegirla, ponerle el pivote, decir de quién
cuelga y vincularla. Cuatro pasos por parte. Con veinte partes son ochenta pasos,
y por eso el rig no se podía usar para construir.

Pero el alambre ya dice todo eso. Un monigote trazado encima del personaje tiene
adentro dónde están las articulaciones, de quién cuelga cada parte y qué pedazo
del dibujo le toca a cada hueso. Sólo faltaba que el programa lo leyera.

## El camino corto

1. En **Construir**, **Crear hueso**: dibujá el alambre encima del personaje,
   arrastrando de una articulación a la siguiente. Si arrancás desde la punta del
   hueso anterior, la cadena se encadena sola.
2. **Repartir el dibujo en el alambre**: cada parte se va con el hueso que le
   pasa más cerca.
3. **Animar**. Listo.

Cada pieza se mide con cinco puntos de su caja, no sólo con el centro: una parte
larga y en diagonal —un brazo cruzado— quedaría del lado equivocado si se midiera
por el centro solo. Y gana el hueso que le pasa más cerca **en conjunto**, no el
que le roza una esquina.

Lo que queda lejos del alambre no se asigna: un fondo o una nota al margen no son
parte del muñeco. El límite sale del largo promedio de los huesos, así que se
adapta al tamaño del personaje. La barra dice cuántas quedaron afuera.

## Qué se midió

Personaje de cinco partes sueltas —cuerpo, cabeza, dos tramos de brazo y una
pierna— con un alambre de cinco huesos dibujado encima:

| | resultado |
| --- | --- |
| reparto | **5 de 5** correctas: cuerpo→torso, cabeza→cuello, brazoA→brazo, brazoB→antebrazo, pierna→pata |
| el rig resultante | rotar el brazo −55° mueve su dibujo y **arrastra el antebrazo**; el cuerpo queda quieto |
| interpolación | 0 · −13.8 · −27.5 · −41.3 · −55 entre las dos claves |

## Y algo que fallaba en silencio

El reparto lee las piezas de la mesa, pero la mesa puede estar a medio repintar
—crear un hueso dispara un repintado— y entonces no encontraba nada y no decía
por qué. Ahora, si el dibujo tiene contenido y la mesa está vacía, la pone al día
antes de mirar.
