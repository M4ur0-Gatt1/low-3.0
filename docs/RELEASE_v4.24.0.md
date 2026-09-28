# LOW v4.24.0 — El eje Z, el salto del papel cebolla y las dos flechas

Tres reportes, los tres reproducidos **en la app real** —no en el navegador— y
los tres arreglados. El primero era de verdad grave.

## 1. «El eje Z sigue sin poder cambiar»

El dato que lo desatascó estaba en la captura: **X valía 240 e Y −290**. O sea
que sí se habían escrito, y sólo Z quedaba en 0. Si el camino de escritura
estuviera roto, X e Y también fallarían: lo que se rompía era el **segundo**
cambio, cualquiera fuese.

Instrumentado en la app real (WebView2 152, el mismo motor), la traza fue
inequívoca:

```
== X ==            selección: "ly:1"   está en la lista: SÍ
vista.onTransform  {x:240}             se escribe
applyToCanvas      (repintado)
== Z ==            selección: null     está en la lista: NO
```

**La causa**: `setCompositionTransform` emitía `"frame"`. Y el manejador de
`"frame"` es el de **cambio de cuadro**: reemplaza el lienzo entero desde el
documento y llama a `dzDeselect()`. Eso vaciaba la lista de planos, la vista
perdía la selección, y el cambio siguiente caía en el `if (!active) return` de
`input()` **sin hacer nada y sin decir nada**.

Mover un plano no es cambiar de cuadro. Ahora viaja por `"composition"`, que
aplica las transformaciones al lienzo **sin tocar su contenido**.

Tres arreglos en el mismo camino:

- el evento correcto, con su propio manejador (`dzCompositionAplicar`);
- `setPlanes` **no borra la selección** cuando llega una lista vacía: un
  repintado transitorio ya no deja el próximo valor sin efecto;
- y sin plano elegido el campo **lo dice**, en vez de callarse. Callarse es lo
  que hacía parecer que el inspector estaba muerto.

Medido en la app real, con el arreglo: `{x: 240, z: 150}`, y la selección
sobrevive. **Escalonar Z** también: `[0, 150] → [80, 0]`.

### Un efecto lateral que valía la pena

El repintado viejo tenía otra consecuencia peor y silenciosa: reemplazar el
lienzo desde el documento **descartaba un dibujo que todavía no se había
volcado**. Al sacarlo, ese trazo se conserva.

En cambio hubo que resolver otra cosa: `data-z` y `data-comp-*` son estado
**derivado** del modelo. Si quedan en el lienzo y no en lo guardado, el próximo
volcado los registra como un «Dibujar» y mover un plano deja **dos** pasos de
deshacer para una sola intención. Ahora la proyección se guarda **sin paso de
historial**, porque el modelo ya registró el cambio con su propia etiqueta.

## 2. «Al hacer clic en el controlador tipo consola de sonido hace un salto de pantalla»

Reproducido y medido. Al enfocar un fader —que es lo que hace cualquier clic—:

| | de | a |
|---|---|---|
| `#onMixer` scrollLeft | 0 | **159** |
| `#dzAnimationDock` scrollTop | 0 | **114** |

Es el `scroll-into-view` implícito del foco. El mixer tiene veinte canales, 505
px de contenido en 240 visibles, así que casi cualquier fader está parcialmente
fuera de la vista y el desplazamiento ocurre **siempre**. El panel se corre
**bajo el puntero**: el fader que agarraste se va de lugar.

No es un defecto del control ni del panel, y no se arregla con
`focus({preventScroll:true})` porque el desplazamiento lo dispara el clic del
navegador. Lo que sí funciona: anotar el scroll de los ancestros en el
`pointerdown` y devolverlo en cuanto el foco terminó de moverlos. El foco se
conserva —hace falta para manejar el fader con el teclado— y la mesa no se
mueve.

Medido con el arreglo: **cero saltos**, y el fader mantiene el foco.

## 3. «La flecha negra y la blanca tienen invertido el color»

Cierto, y medible: la flecha **negra** se pintaba con `fill: rgb(255,255,255)`
—rellena de blanco— y la **blanca** salía hueca con contorno gris. Las dos
usaban `currentColor`, que en un tema oscuro es claro, así que la que se llama
negra era la que se veía sólida y clara.

Ahora cada una lleva **su interior explícito** —oscuro la negra, claro la
blanca— con contorno para que ninguna se pierda sobre su fondo, incluido el
naranja del estado activo. Se leen por su nombre en cualquier tema.

## Pruebas

`tools/check_composition_z_ui.js`, nuevo y en la puerta de CI: **tres cambios
seguidos** del inspector tienen que caer los tres (era el segundo el que se
perdía), la lista de planos y la selección tienen que sobrevivir, Escalonar Z
tiene que mover profundidades, el campo sin plano tiene que hablar, y tocar un
fader no puede mover ningún scroll.

Y una nota sobre cómo se escribió, porque la primera versión **no servía**:
pasaba igual con el código viejo. En el navegador con el mock el documento tiene
contenido, así que el repintado lo restauraba idéntico y el defecto no se veía.
Hubo que montarlo fiel al mecanismo: se agrega un **testigo** al lienzo sin
volcarlo al documento, y si el cambio de composición dispara el manejador de
cuadro, el testigo desaparece. Con eso el guard falla con el código viejo, que
es la única forma de que sirva.

8 contratos estáticos nuevos.

## Lo que este episodio deja dicho

Los tres reportes se midieron primero en el navegador con el mock, y los tres
**pasaban**. El defecto sólo aparecía en la app real. Desde ahora, cuando algo
se reporta y no se reproduce, la app real con depuración remota
(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224`) es el
primer lugar donde hay que mirar, no el último.

## Reversión

Estable previa: `v4.23.0`. El cambio de evento se revierte devolviendo
`this.emit("frame")` en `setCompositionTransform` (`ui/animation/document.js`);
el resto son un módulo aparte y dos símbolos SVG.
