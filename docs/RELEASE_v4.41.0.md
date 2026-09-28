# LOW v4.41.0 — el esqueleto se edita y se le pega el dibujo

> «el flujo para unir un esqueleto a un dibujo no está andando, no se puede
> editar el esqueleto de ejemplo, no se entiende el funcionamiento»

Tres síntomas, **una sola causa** escondida en el modelo: un esqueleto puede
tener **pivotes** y no tener **cola**.

## 1. Un esqueleto sin cola no es un esqueleto

El personaje de ejemplo nacía con **19 huesos y cero colas**. En la mesa se veía
entero —la línea del hueso se dibuja desde la articulación del padre— pero para
el programa ahí no había ningún hueso. De ahí salían los tres síntomas:

- **«Editar» no editaba**: el gesto sobre el cuerpo del hueso caía en «elegir»,
  porque la regla dice «editar el cuerpo sólo si es un hueso», y sin cola no lo
  era. Lo único que se movía era el pivote.
- **No había punta que arrastrar**, así que no se podía alargar ni encadenar.
- **«Repartir» contestaba «primero dibujá el alambre»** con el esqueleto puesto
  encima del personaje. Ese era exactamente el paso que faltaba dar.

Ahora la cola se **deduce de la propia jerarquía**: la de un hueso con hijos es
la articulación del hijo que **continúa la cadena** —el más alineado con la
dirección que traía, no el primero de la lista: el cuello continúa al pecho, el
hombro no—; la de una punta —mano, pie, cabeza— se estira en esa misma
dirección. **El pivote no se toca**, así que las poses y las claves ya grabadas
quedan donde estaban.

Pasa en los tres caminos por donde puede entrar un esqueleto mudo: el personaje
de ejemplo, abrir el modo rig, y «Repartir».

## 2. «Colocar» medía la hoja, no el dibujo

Las plantillas de la biblioteca son **proporcionales** (la cabeza al 18% del
alto, la cadera al 62%…) y esas proporciones se aplicaban **al lienzo entero**.
El esqueleto caía en el medio de la página, con el personaje a un costado y a
otra escala. Después «Repartir» ataba la **pierna** del dibujo a la **mano** del
esqueleto, porque era el hueso que le quedaba más cerca.

Ahora se mide el **dibujo**: se une la caja de todas las piezas de la mesa
—respetando las transformaciones de los grupos— y el esqueleto se coloca sobre
esa caja. Cada hueso nace sobre la parte que le toca. Medido en el recorrido: de
**3 piezas atadas a 4**, y las que quedan afuera son las que de verdad están en
otra pose que la plantilla.

Y lo dice: «20 huesos colocados **encima del dibujo**» o «en el centro de la
hoja (no hay dibujo que medir)».

## 3. Que se entienda qué falta

- **«Repartir» ahora nombra** las piezas que quedaron sin hueso —antes decía
  «3 quedaron lejos del alambre», que no dice cuál— y dice qué hacer con ellas:
  acercarles un hueso, o elegir pieza y hueso y tocar **Vincular**.
- Si no ata ninguna, ya no dice «dibujalo ENCIMA del personaje» —el alambre
  puede estar puesto— sino **cómo moverlo**: Construir → Editar, y repartir de
  nuevo.
- El cartel de estado del panel decía «podés crear movimiento ahora y vincular
  el personaje después» **con el dibujo ahí**, y dejaba al dibujante mirando el
  panel. Con arte en la mesa ahora nombra el paso que falta: «acomodá el alambre
  sobre el personaje y tocá **Repartir**».

## 4. Dos cosas más que aparecieron probando

- **La herramienta de nodos no podía agregar un punto.** Desde que editar por
  puntos deja seleccionado lo que se edita (v4.40.x), la caja de selección
  quedaba **encima** del trazado y sus tiradores se comían el clic: el segundo
  clic redimensionaba en vez de agregar. En el editor de nodos no se escala —se
  editan puntos, como la flecha blanca de Illustrator—, así que ahí los
  tiradores dejan pasar el puntero.
- **El riel de herramientas escondía el cuentagotas y la pluma.** Repartía las
  herramientas con un paso fijo de 33 px que quedó viejo cuando los botones del
  estudio pasaron a 27 px. Ahora el paso **se mide**, y entran las que entran.

## Pruebas

- **`check_rig_flujo_ui.js`, nueva y en CI**: abre el personaje de ejemplo y
  exige que **los 19 huesos tengan alambre**; arrastra el hueso del brazo con
  «Editar» y exige que se mueva; y después dibuja un personaje de seis piezas,
  coloca un esqueleto de la biblioteca encima y aprieta **Repartir**, exigiendo
  que ate la mayoría y que **no** conteste «primero dibujá el alambre».
  Dos mutaciones verificadas (la deducción del alambre, y la regla del gesto).
- **Cinco contratos estáticos nuevos** (301 en total), los cinco verificados por
  mutación.
- **Una prueba que acusaba en falso**: `check_document_tabs_ui` no fijaba el
  tamaño de la ventana ni limpiaba el `localStorage`, y el riel reparte
  herramientas según el alto **real**. Según con qué tamaño arrancara el
  navegador, decía que el cuentagotas y la pluma habían desaparecido. Ahora fija
  1366×768 y arranca limpia.
- **Una prueba que fallaba a veces**: `check_safe_mode_ui` esperaba a que
  *existieran* las funciones y leía el estado del arranque seguro enseguida; bajo
  carga la etiqueta de versión todavía no estaba escrita y acusaba «no entró en
  modo seguro». Ahora espera **la condición**, no la existencia.
- Puerta completa: **12 suites, 12 comprobaciones de puente y 43 recorridos.**

## Reversión

Estable previa: `v4.40.0`. Lo nuevo vive en
`ui/rigging/alambre-desde-pivotes.js`; en `app.js`, `ui/animation/rig-policy.js`
y `ui/app.css` son líneas plegadas.
