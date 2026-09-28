# LOW v4.20.0 — La selección apunta donde uno mira

Dos reportes, los dos ciertos, los dos con la misma forma: uno hace algo, no
pasa nada visible, y concluye que la herramienta es de adorno.

## 1. «Cuando hay un elemento dentro de otro no selecciona precisamente donde estoy»

### La causa

El navegador acierta el impacto **sólo donde hay pintura**. Una forma sin
relleno —un cuadrado dibujado nada más que con su contorno— **no existe** para
el puntero en su interior. No es que pierda contra la de atrás: no se la
considera en absoluto.

Reproducido con un cuadrado sin relleno encima de uno rojo grande, clickeando
el centro del chico:

| | |
|---|---|
| lo que el navegador entrega bajo el punto | `grande, rect, rect, svg` — **el chico no aparece** |
| lo que LOW seleccionaba | `grande`, el de atrás |

Es la semántica correcta de SVG, y también la de Illustrator con «selección
sólo por trazado». Pero en una mesa de dibujo lo que uno espera es que gane
**lo que está adelante en ese punto**, tenga relleno o no.

### Lo que cambia

`ui/drawing/hit-test.js` decide por **geometría**, recorriendo de adelante hacia
atrás —que en SVG es el orden de pintado invertido—:

- **el área** para las formas cerradas, con `isPointInFill`, que prueba la
  geometría del relleno y **no el color**: contesta que sí adentro del cuadrado
  aunque su `fill` sea `none`. Eso se verificó en el navegador *antes* de
  construir encima;
- **el trazo** para las abiertas: el hueco de una curva sin cerrar no es algo
  que uno sienta como «adentro», así que no la selecciona;
- **holgura** para las líneas finas, midiendo la **distancia real al trazado**.
  El primer intento fue una cruz de cinco puntos alrededor y falló medido: un
  clic a tres píxeles de una raya horizontal caía justo entre las puntas de la
  cruz. La distancia no tiene agujeros;
- el papel, el papel cebolla y las guías de pantalla **no se seleccionan
  nunca**, y una capa bloqueada 🔒 sigue bloqueada.

La holgura se mide en píxeles de pantalla y se convierte a unidades del dibujo,
así que alejarse no la agranda ni acercarse la achica.

### Crear hueso hereda el arreglo

`dzRigArtAtPoint` —la pieza de dibujo bajo el punto, la que usa «Crear hueso»
para vincular el hueso sin pasos extra— arrastraba **el mismo defecto**: buscaba
por pintura, así que una pata dibujada con línea no se encontraba en su interior
y el hueso terminaba colgado del cuerpo. Se mudó al módulo nuevo y ahora prueba
primero la geometría, con la caja envolvente más chica como último recurso.

## 2. «Ahí no se pueden cambiar los valores, no hace nada ahí»

El inspector de Composición. Los campos escuchaban **sólo `change`**, que en un
`<input type=number>` llega recién al salir del campo o al apretar Enter. Uno
tipea, mira la mesa, no pasa nada. Y **las flechas del teclado no disparan
`change` nunca**, así que subir un valor con la flecha no hacía absolutamente
nada.

| | antes | ahora |
|---|---|---|
| tipear `-90` en X | el plano seguía en 190 | X = −90, y la tarjeta se mueve en el acto |
| flecha ↑ en Z | Z seguía en 150 | Z = 160, y la tarjeta se aleja |
| a medio tipear (`-`, `.`) | — | no manda el plano al cero |
| pasos de historial | — | **uno**, al confirmar |

Mientras se tipea es **vista previa**: mueve la tarjeta y nada más. El paso de
historial se escribe al confirmar, así que tipear un número de tres cifras no
deja tres pasos de deshacer.

## Pruebas

`tools/check_hit_test_ui.js`, nuevo y en la puerta de CI. Siete casos: la forma
sin relleno adelante, la rellena adelante, el orden de pintado en la zona común,
la línea fina con y sin holgura, el hueco de una curva abierta, que el papel
siga arrancando el marco de selección, y que el papel cebolla no se pueda
agarrar.

Y una sección de inspector en `check_composition_ui.js`.

**Los dos guards se comprobaron contra el código viejo**, y fallan con el
mensaje del reporte: *«el clic dentro de una forma sin relleno selecciona la de
atrás»* (`elegido: "grande"`) y *«escribir un valor en el inspector no mueve el
plano: el panel es de adorno»* (`flechaEnZ: 150`, sin moverse).

En el camino se corrigió **una prueba propia**: disparaba el evento sobre
`#dzCanvas` en vez de sobre el elemento que el navegador pone bajo el punto. Con
eso, el código viejo arrancaba el marco de selección y la prueba habría pasado
**por el motivo equivocado**. Una prueba que pasa por la razón errada es peor
que no tenerla.

## `app.js`

De 17.841 a **17.813** líneas: `dzRigArtAtPoint` se fue al módulo donde
pertenece. El techo bajó con él.

## Un reporte que no reproduje

«Los botones de arriba tampoco hacen nada». Los medí todos y todos responden:
las vistas (Frente, Arriba, Perspectiva, Cámara), Grid, Snap, Centrar,
Auto-key, Escalonar Z y las pestañas de espacio de trabajo. Queda anotado sin
arreglar, porque arreglar lo que no se reprodujo es adivinar. Decime cuál botón
y qué esperabas que pasara.

## Reversión

Estable previa: `v4.19.0`. La selección cambia de criterio, no de mecánica: si
algo se comporta raro al seleccionar, el módulo entero se puede desactivar
sacando `ui/drawing/hit-test.js` del `index.html` y la selección vuelve a la
anterior sin tocar nada más.
