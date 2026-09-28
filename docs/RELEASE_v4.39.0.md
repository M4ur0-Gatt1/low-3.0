> «las herramientas de vector no funcionan en general y las que andan son una
> poronga. Por ejemplo el inflador debe ser como el inflador de línea de
> OpenToonz: lo que debe inflar es la línea, el contorno, ensancharla o
> desinflarla si lo uso con Alt. También falta alguna herramienta para añadir
> puntos de vector en las líneas ya creadas.»

# LOW v4.39.0 — las herramientas de vector ya tienen de dónde agarrar

Antes de tocar nada medí **una por una**, con arrastres de verdad, qué hacía
cada herramienta de vector:

| herramienta | qué hacía |
|---|---|
| Inflar forma | agrandaba la forma, no la línea |
| Bomba de grosor | andaba |
| Plancha | andaba |
| Pinza | cortaba |
| **Imán** | **nada**, y el aviso decía «Deformación aplicada» |
| **Nodos** | nada donde uno toca |

Y apareció la causa común, que es la respuesta a «no funcionan en general»:

> **Una curva recién dibujada tiene DOS anclas, las dos en las puntas.** Y todas
> las herramientas de vector trabajan sobre anclas. En el medio de la línea no
> hay nada que agarrar.

No estaban rotas: estaban trabajando sobre puntos que no existían.

## 1. Agregar puntos a una línea ya dibujada

Con la herramienta de nodos, **el primer clic elige la línea y el segundo
agrega un punto** donde tocaste. Elegir no modifica nada — si agregara de una,
elegir una línea la cambiaría.

El punto se inserta **partiendo el tramo** con De Casteljau: una curva cúbica se
parte en dos cúbicas que juntas dibujan exactamente la misma curva. Medido: el
trazado pasa de 2 a 3 anclas y los puntos muestreados sobre la curva quedan
**idénticos**. Agregar un punto que deforma el dibujo sería una deformación
disfrazada de ayuda.

Funciona en trazados, polígonos y polilíneas; una línea de dos puntos se vuelve
polilínea al recibir el tercero, que es lo que uno acaba de pedir.

## 2. El inflador infla la LÍNEA, como el Pump de OpenToonz

Antes escalaba la **forma** hacia afuera desde el centro, como un globo, y el
grosor del contorno no lo tocaba. Para un dibujante eso no es inflar una línea:
es agrandar el dibujo.

Ahora:

- **Sobre un trazo de pincel la hinchazón es LOCAL.** El trazo guarda un punto
  por muestra con su presión, así que se sube la presión de los que caen bajo el
  cursor, con caída suave hacia los costados, y se vuelve a entintar: la línea
  engorda **donde pasás**, no entera. Medido: el punto del medio pasa de 1 a
  **2,03** y las puntas quedan en 1.
- **Con Alt, desinfla.**
- **Sobre un trazo común** no hay ancho por punto —el grosor es uno solo— así
  que se infla toda la línea **y el aviso lo dice**. Callarlo sería prometer algo
  que no hizo.
- Cada pasada suma: pasar dos veces engorda más, que es como se modula una línea
  de verdad.

## 3. El imán dejó de mentir

Apoyado en el medio de una curva no movía nada, porque ahí no había ancla — y
avisaba «Deformación aplicada». Ahora, si no encuentra una a su alcance,
**agrega la que falta** y tira de ésa. Como el punto se inserta partiendo el
tramo, agregarlo no cambia el dibujo: lo que cambia es que ahora hay de dónde
tirar.

## Pruebas

- **`check_herramientas_vector_ui.js`, nueva y en CI**: agrega un punto con dos
  clics reales y exige que la curva **no se mueva**; infla un trazo de pincel y
  exige que el medio engorde **y las puntas no**; comprueba el Alt; y arrastra el
  imán en el medio de una curva exigiendo que deforme. Cuatro mutaciones
  verificadas.
- **Seis contratos estáticos nuevos** (290 en total), uno negativo: el inflador
  **no** puede volver a escribir geometría.
- Puerta completa: **12 suites, 12 comprobaciones de puente y 43 recorridos. 0
  fallos.**
- Comprobado en la app real: 2 → 3 anclas sin deformar, y presión 1 → 2,01 en el
  medio con la punta intacta.

## Una prueba vieja que medía lo que ya no existe

`check_rig_skeleton_ui` comprobaba que el inflador cambiara el **ancho** del
rectángulo — o sea, el comportamiento que se pidió cambiar. Lo que ese tramo
quiere probar sigue valiendo (que un gesto vectorial cambie algo y que cancelarlo
lo devuelva exacto), así que ahora su sujeto tiene contorno y se mide el
contorno.

**Y al editarla me comí una:** reusé la misma variable para el ancho y para el
grosor, y rompí otra afirmación del mismo bloque. La agarró la puerta local, no
CI.

## Otra trampa mía, ésta peor

Dos de mis mutaciones **no se aplicaron nunca**: el patrón terminaba en `\n` y el
archivo usa CRLF, así que el reemplazo no encontró nada y siguió de largo **sin
avisar**. Una decía «no mordió» por un motivo falso. Ahora el ayudante de
mutaciones **falla si el patrón no coincide**: una mutación que no se aplica es
peor que no hacerla, porque deja creer que la prueba se verificó.

## Reversión

Estable previa: `v4.38.1`. Lo nuevo vive en `ui/vector/puntos-linea.js` y
`ui/vector/inflar-linea.js`; en `app.js` son el inflador (que quedó más corto) y
una línea en el imán.
