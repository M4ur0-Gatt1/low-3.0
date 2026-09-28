# LOW v4.21.0 — Los deslizadores del pincel dejan de mentir

BRUSH-02 de la matriz de regresión decía: *«cada parámetro visible produce una
diferencia medible en el trazo»*, y estaba abierto con esta nota honesta: *«hoy
hay parámetros que no se puede afirmar que hagan algo»*.

Ahora se puede afirmar, porque se midió.

## Cómo se midió

Dibujando. Se elige el pincel **como lo elige el Estudio** y se hace el mismo
gesto —presión creciente, inclinación, curva—, una vez con el parámetro en el
mínimo y otra en el máximo, y se compara el elemento SVG que queda. Si el trazo
sale idéntico, el deslizador no hace nada.

Hubo dos mediciones falsas mías antes de la buena, y vale decirlas porque
explican por qué el defecto había durado tanto:

- **medir el motor en vez del trazo.** Probar `buildVectorOutline` directamente
  daba un resultado y el programa daba otro, porque el trazo real pasa antes por
  `dzBrushSelect`, que copia `size` y `smoothing` a la barra;
- **saltear `dzBrushSelect`.** Guardando el preset y poniendo `DZ.brushPreset` a
  mano parecía que **Tamaño** no hacía nada. Era mi atajo, no el programa.

## Lo que estaba roto

**Ocho de los veintidós pinceles incorporados no declaran motor** —Lápiz azul,
Lápiz rojo, Tinta limpia, Tinta técnica, Tinta áspera, Tinta de cómic, Sumi-e y
Caligrafía—. Y el trazo final comparaba `brush.engine` contra los dos nombres
**antes de normalizar**: al no coincidir ninguno, caía al camino viejo, que sólo
entiende grosor. **El motor entero quedaba sin usar.**

`normalizeBrush` ya resolvía eso hace tiempo —«lo que no es raster, es
vector»—; el defecto era comparar antes de aplicar esa regla. Ahora la regla
vive en un solo lugar.

Medido, en un pincel vectorial:

| | antes | después |
|---|---|---|
| parámetros que cambian el trazo | **2** de 9 | **7** de 9 |
| …y los dos que quedan | mudos | apagados, con el motivo |

Los tres que despertaron con el arreglo del motor son **Espaciado**, **Presión →
tamaño** e **Inclinación**. Los otros dos fueron arreglos propios:

- **Opacidad** — la cinta salía siempre opaca. Va como `fill-opacity`, no como
  `opacity`, para no pisar la opacidad del elemento, que la usan el papel
  cebolla y la capa.
- **Dispersión** — en raster corre cada sello; una cinta vectorial no tiene
  sellos, tiene un eje, así que corre **el eje**: el trazo sale tembloroso. Las
  puntas quedan quietas, porque el trazo tiene que empezar y terminar donde uno
  apoyó y levantó el lápiz.

Y en raster faltaba uno:

- **Dureza** — el motor la calculaba y nadie la pintaba. Ahora el borde del
  sello se desvanece desde donde lo dice la dureza. Va **un solo gradiente por
  trazo**, compartido: uno por sello serían hasta 1600 por trazo. Con dureza 1
  el gradiente ni se crea, así que un pincel duro no paga nada.

## Los dos que no pueden hacer nada, y qué se hizo con ellos

**Presión → opacidad** y **Dureza** no existen en una cinta vectorial: es **un
solo camino relleno**, así que no puede cambiar de opacidad a lo largo del trazo
ni tener el borde difuso. No es que falten; no existen en esa forma de dibujar.

Se podía fingir —promediar la presión y aplicar una opacidad constante, por
ejemplo—. No se hizo: eso es un deslizador que se mueve y da otra cosa.

Se muestran **apagados, con el motivo en el título**. Un deslizador vivo que no
cambia nada es peor que uno apagado que explica por qué. Con un pincel raster
elegido, los dos vuelven a estar vivos.

## Pruebas

`tools/check_brush_params_ui.js`, nuevo y en la puerta de CI. **Dibuja** el
mismo gesto con cada parámetro en los dos extremos, en los dos motores, y exige
que cada uno cambie algo **o** esté declarado inerte. También exige lo inverso:
que nada declarado inerte cambie el trazo, para que la pantalla no apague cosas
que sí funcionan. Y que ningún pincel incorporado pueda saltearse el motor.

Comprobado contra el código viejo: falla con *«un pincel incorporado se saltea
el MOTOR y cae al camino viejo»*.

10 contratos estáticos nuevos.

## `app.js`

De 17.813 a **17.753** líneas: `dzBrushFinalElement` se fue a
`ui/drawing/brush-render.js`, que es donde caían los tres arreglos.

## El balance, al día

`docs/LOW_BALANCE_2026-09.md` tenía cifras de la v4.14.0. Se le puso un
encabezado con el estado de hoy y se dejó el cuerpo sin retocar, para poder ver
qué se movió.

De las seis faltas: **tres cerradas** (rendimiento medido, humo en los tres
sistemas, y los P1 SAFE-01/02 y BRUSH-02), **una en camino y sin retroceder**
(partir `app.js`, con puerta de CI), y **dos abiertas**:

- **la prueba maestra de §15** — una persona ajena, un proyecto completo. Sigue
  sin correrse ni una vez, y **no la puedo hacer yo**;
- **MOCAP-05** — oclusiones, paneo y dos sujetos. Falta material de video.

Rendimiento sube de 4 a 6, Distribución de 5 a 6, Vector de 6 a 7 y Composición
de 6 a 7. **El producto sigue en 6**, y no por algo técnico: 7 es «confiable en
proyectos definidos», y todo lo que sabemos de uso real viene de una sola
persona, que además es quien pide las funciones.

## Reversión

Estable previa: `v4.20.0`. Si un pincel se comporta raro, el cambio de motor se
revierte en una línea (`dzBrushMotor` en `ui/drawing/brush-render.js`) y los
pinceles vuelven al camino de sólo-grosor.
