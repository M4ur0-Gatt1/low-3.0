# LOW v4.50.0 — el personaje en todos los cuadros, y los paneles se esconden

Tres cosas, y la primera es la que desbloquea animar de verdad.

---

## 1. «El personaje está sólo en el primer cuadro»

Reportado así: *«no entiendo cómo se anima, porque el personaje no está en
todos los frames, está sólo en el primer frame, pero el esqueleto sí está en
todos»*.

No había nada mal hecho. En cut-out el dibujo se hace **una vez** y se
**sostiene** a lo largo del plano: lo que cambia cuadro a cuadro son las
poses, no el dibujo. Con el arte expuesto sólo en el cuadro 1, del 2 en
adelante el rig no tiene a quién mover.

**Lo que fallaba era la pantalla, no el modelo**, y fallaba por duplicado:

- El bloque del rig decía «Rig listo para animar · todas las piezas
  detectadas están vinculadas», **en verde**, mientras posar en el cuadro 12
  no movía nada. Ese bloque nunca miraba la exposición.
- La barra de estado sí lo decía —«F12: este cuadro no tiene al personaje ·
  sostené su dibujo (↔ en la hoja de tiempos)»— pero pedía una maniobra con
  una manija de 4 px y no ofrecía la acción. Dos partes de la pantalla
  contando cosas distintas, y ninguna con el botón.

**Ahora**, cuando el personaje queda corto, el bloque deja el verde y dice
«El personaje llega al cuadro 1 y la animación al 18: del 2 en adelante no
hay a quién mover», con un botón **Sostener en todo el rango (F5)**.

**F5 es el atajo de Toon Boom Harmony** para *Extend Exposure*; quien viene de
ahí lo aprieta sin pensar. El evento se corta siempre que se atiende: F5
recarga la página en el navegador y en WebView2, y perder el trabajo por
pedir un sostenido sería el peor cambio posible.

Es un **hold**, no copias: la misma celda expuesta, como en cut-out. Y no
pisa nada de lo que ya estuviera expuesto.

MEDIDO: personaje en el cuadro 1, animación hasta el 12 → un clic lo sostiene
11 cuadros más, y posar en el 11 mueve el dibujo 51 px. Antes no movía nada.

## 2. Todas las ventanas de herramientas se pliegan

Pedido: «todas las ventanas de herramientas se deben poder esconder como
escondemos la línea de tiempo».

**Dos formas de panel, y no se pliegan igual.** Medido: Herramientas 74×418,
Propiedades 246×418, Rigging 251×346 son columnas; la línea de tiempo
1366×38 es una barra. A una columna plegarla «hacia arriba» no le devuelve
nada a la mesa: sigue ocupando sus 246 px. Así que la orientación se decide
por la **forma medida** de cada panel, no por una lista escrita a mano.

MEDIDO: plegar las columnas laterales le devuelve **240 px de ancho** al
lienzo, y desplegarlas lo devuelve al tamaño exacto.

Dos defectos que encontró el propio guardia mientras se escribía, y que son
justo la regla que se había enunciado («la pestaña no puede desaparecer al
plegar»):

- En Herramientas el panel quedaba en 22 px y **su pestaña en 2 px**: el
  relleno del panel se comía el ancho. Visible para el CSS e inútil para el
  dedo.
- La Paleta colapsaba en las dos direcciones y quedaba un cuadrado de 22×21.
  Se resolvió sacándole pestaña: es un **sub-panel** —vive dentro de
  «Propiedades y capas»— y plegar al dueño ya la esconde.

## 3. La pestaña de la línea de tiempo decía «sin cuadros» con 18 cuadros

Defecto introducido en la v4.49.0. La pestaña leía `DZ.anim.frames`, que es el
modelo **viejo** de los cuadros como archivos `_f001.svg` sueltos. Un `.low`
guarda los cuadros en el documento y deja eso vacío, así que anunciaba «sin
cuadros» mientras la barra de estado decía «cuadro 7/18» diez centímetros más
abajo.

Ahora sigue el mismo orden que usa `dzSbFrame`: manda el documento y `DZ.anim`
es el respaldo. Y el guardia ya no compara contra el mismo dato que usa el
módulo —eso no probaría nada— sino contra **la barra de estado de la app**,
que se calcula por otro camino: si las dos partes de la pantalla no coinciden,
el test falla.

Al arreglarlo apareció otra del mismo cambio: la pestaña dejaba de encender la
animación y sólo mostraba el cuerpo, dejando una tira de tiempo sin nada
detrás. La decisión de «qué decir» y la de «qué encender» quedaron separadas.

---

## Tres regresiones que la puerta atajó antes de salir

Las tres las causó el mismo módulo nuevo, y las tres tienen la misma raíz: un
control que se inyecta en paneles ajenos les estaba cambiando cosas que no le
correspondían.

| qué hacía la pestaña | qué rompía | quién la cazó |
|---|---|---|
| fila completa en el flujo | 15 de las 16 herramientas del riel quedaban fuera del panel, sin barra de desplazamiento | el guardia de paneles, con un criterio que hubo que agregarle |
| reescribía su `title` en cada repintado | volvía el cartel doble arreglado en la v4.45.2: el módulo de ayuda le SACA el `title` al botón mientras muestra su globo, y esto se lo devolvía | `check_ayuda_no_tapa_ui` |
| ponía `position: relative` a todos los paneles | le pisaba la posición propia a `#dzStoryboard` y el panel se estiraba encima del escenario | `check_storyboard_ui` |

La regla que queda escrita en el módulo: **una pestaña inyectada no puede
costar nada** — ni espacio de layout, ni atributos que otro módulo esté
usando, ni posicionamiento. Desplegada sale del flujo, escribe la ayuda donde
el módulo de ayuda la guarda, y sólo ancla el panel si no tenía posición
propia.

Vale anotar que el guardia de paneles **no cazaba la primera**: pedía que la
pestaña se viera, no que no expulsara al resto. Quince herramientas
inalcanzables con el test en verde.

## Guardias

- `tools/check_sostener_personaje_ui.js` — siete cosas, incluidas las dos que
  importan: que el botón **sostenga de verdad** y que **posar allá mueva el
  dibujo**. Más el atajo F5, comprobando que no recargue la página.
- `tools/check_paneles_plegables_ui.js` — que plegar **devuelva mesa**, que la
  pestaña siga **visible y alcanzable por el clic** (esta encontró los dos
  defectos de arriba) y que desplegar devuelva el tamaño exacto.
- `tools/check_tl_pestania_ui.js` — reforzado: la pestaña tiene que coincidir
  con la barra de estado.

Todos probados al revés. `app.js` sin tocar, en el techo (17.075 líneas).

## Lo que sigue, con evidencia

MEDIDO en esta versión, y **todavía sin arreglar**: si se pone una sola clave
en el cuadro 8, el cuadro 1 se mueve igual — 55 px los dos. La primera pose se
destruye. Harmony advierte exactamente esto: *«make sure there is a keyframe
on the first frame of every layer of the model. This ensures that when you
make the second pose later, your first pose will not be affected»*. LOW ni
pone esa clave ni lo avisa.

Sigue abierto también el dibujo que desaparece al colocar el esqueleto (nunca
reproducido) y el intermitente de `check_export_anim_ui`.
