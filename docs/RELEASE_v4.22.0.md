# LOW v4.22.0 — La edición de puntos deja de tener cero pruebas

El balance decía que Vector estaba frenado porque *«la edición de nodos y
contornos casi no tiene pruebas propias»*. Era más literal de lo que parecía:
de `dzPathParse`, `dzPathBuild`, `dzNodesFor`, `dzNodeMove` y `dzNodeDelete` no
había **ninguna**. Lo único que se comprobaba era que el botón de la
herramienta existiera en la barra, que es presencia, no conducta.

Escribiendo esas pruebas apareció un defecto que nadie había reportado.

## El Ctrl+Z que no se veía

Medido: **mover un punto dejaba dos pasos de historial** —el snapshot del
lienzo y el volcado al documento— y hacían falta **dos Ctrl+Z** para volver, el
primero de los cuales no cambiaba nada en pantalla. Uno lo aprieta, no ve nada,
y lo aprieta de nuevo.

La primera hipótesis fue que sobraba el snapshot. Medida, era al revés:

| | pasos | Ctrl+Z para volver | ¿vuelve? |
|---|---|---|---|
| como estaba | 2 | 2 | sí |
| sacando el snapshot | 1 | 4 | **no, nunca** |
| **ahora** | **1** | **1** | **sí** |

Los dos pasos hacen falta: el snapshot es el que restaura, y el volcado es el
que lleva el cambio al documento. Lo que faltaba era **agruparlos**. El gesto
abre una transacción del historial, y antes de cerrarla **fuerza el volcado**,
que si no caería 260 ms después —ya fuera de la transacción— como un paso
aparte. Ese retardo existe por una buena razón: no serializar el SVG entero en
cada punto de un trazo. Sólo había que adelantarlo al terminar el gesto.

Lo mismo vale para el doble clic que borra un punto. Y si el gesto se cancela,
la transacción se cancela con él, para que el próximo cambio no caiga adentro.

El paso se llama **«Editar puntos»**, así que el menú de deshacer dice qué se
va a deshacer.

## Lo que ahora está probado

`tools/check_vector_nodes_ui.js`, en la puerta de CI. Once comprobaciones, y
las de formato son las que más importan porque se rompen en silencio:

- **cuatro maneras de escribir el mismo trazado** —largo, con comandos
  relativos, con H y V, y con la L implícita que sigue a una M— tienen que
  leerse igual. Si el lector se equivoca ahí, el primer arrastre reescribe el
  trazado entero y el dibujo se deforma sin que nadie toque nada más;
- **un trazado ilegible devuelve null**, no un intento. Escribir encima de lo
  que no se entendió es peor que no editar;
- mover el último punto **no mueve el arranque**, y no cambia la forma de los
  comandos;
- borrar puntos **tiene piso**: no se puede dejar un trazado degenerado, ni
  quitarle un vértice a un triángulo, ni un extremo a una línea;
- borrar el primer punto **no deja el trazado sin arranque**: el siguiente pasa
  a ser la M;
- un rectángulo **dice** que no tiene puntos editables, en vez de quedarse
  mudo;
- y la herramienta encuentra un trazado **sin relleno** por adentro, con la
  misma puntería que la selección (v4.20.0). Antes usaba `elementFromPoint` y
  agarraba lo de atrás.

Comprobado contra el código viejo: falla en la primera vuelta.

6 contratos estáticos nuevos.

## Una prueba mía que estaba mal

La primera versión leía el trazado por una referencia guardada antes de
deshacer. Pero **deshacer reemplaza la hoja entera**, así que esa referencia
queda colgada y devuelve el atributo de un elemento que ya no está puesto.
Parecía un defecto del programa y era del test. Ahora se vuelve a consultar por
id, y el comentario quedó escrito en el archivo para que no vuelva a pasar.

## `app.js`

De 17.753 a **17.596** líneas: el editor de nodos —157 líneas— se fue a
`ui/vector/node-editor.js`, que es donde caía el arreglo del historial. Es el
tercer release seguido en que la puerta de `app.js` obliga a sacar algo antes
de poder agregar, y las tres veces lo que salió estaba mejor afuera.

## Balance

Vector pasa de 6 a **7**. No sube a 8 porque le falta producción: un dibujo
entintado de verdad con estas herramientas.

Fila nueva en la matriz: **NODE-01**, automatizada.

## Reversión

Estable previa: `v4.21.0`. El arreglo del historial se revierte sacando
`dzNodesHistoria()` y `dzNodesCerrarPaso()` de `ui/vector/node-editor.js`; el
resto del módulo es el mismo código que estaba en `app.js`.
