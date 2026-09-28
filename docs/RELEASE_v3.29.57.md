# LOW v3.29.57 — El tramo activo se agarra y se arrastra

Elegir qué pedazo de la escena estás animando —de qué cuadro a qué cuadro— sólo
se podía haciendo cuentas en dos casilleros, **In** y **Out**, arriba en la barra
de transporte. El modelo ya lo guardaba y el transporte ya lo respetaba, pero no
se veía en ninguna parte.

## Cómo funciona

Sobre la regla de la línea de tiempo, los dos bordes del tramo llevan una
**manija**: se agarran y se arrastran. Lo que queda afuera se **atenúa**, así se
ve de un vistazo qué parte está activa — la zona activa de Toon Boom y
OpenToonz.

**Doble clic** en la regla devuelve el tramo a toda la escena.

Los casilleros In/Out siguen ahí y son lo mismo: escribir en uno mueve las
manijas, y arrastrar las manijas escribe en los casilleros.

## Un detalle que lo hacía inconsistente

El tramo vive en el modelo de la escena, pero el transporte y el export leen los
casilleros. Escribir en un solo lado dejaba las dos cosas diciendo valores
distintos: podías arrastrar el tramo a F4–F9 y que la reproducción siguiera
usando el rango viejo. Ahora cada cambio escribe en el modelo, en los casilleros
y en el transporte a la vez.

## Qué se midió

Sobre el personaje de ejemplo, 13 cuadros:

| caso | resultado |
| --- | --- |
| arrastrar la manija de entrada al cuadro 4 | tramo F4–F13, cuadros 1 a 3 atenuados |
| arrastrar la de salida al 9 | tramo F4–F9, atenuados el 1-3 y el 10-12 |
| arrastrar a F5–F10 | modelo, casilleros y transporte los tres en 5 / 10 |
| doble clic en la regla | vuelve a toda la escena y se re-atenúa desde el 14 |

## Lo que encontré de paso

**Exportar la animación no funciona con las escenas del modelo nuevo.** No tiene
que ver con el tramo: `dzDoExport` recorre `DZ.anim.frames`, la lista del modelo
viejo, que en una escena actual está vacía — así que el diálogo de exportar ni
siquiera abre. Queda anotado; es un arreglo aparte.
