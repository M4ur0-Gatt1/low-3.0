# LOW v3.29.51 — El rig se puede animar

Hasta acá el rig se armaba bien y no se podía usar. La causa era una sola, y no
estaba en la matemática: **agregar cuadros vaciaba la escena**.

## Agregar un cuadro dejaba al rig sin nada que mover

El botón de cuadro nuevo hacía siempre lo mismo: crear un dibujo en blanco y
exponerlo. Para animación tradicional es exactamente lo que corresponde. Para un
muñeco riggeado es lo contrario de lo que hace falta — un personaje riggeado se
anima **con poses, no redibujándolo**.

El resultado era que apenas extendías la animación el personaje desaparecía del
cuadro nuevo, y a partir de ahí ningún control del rig hacía nada: no había nada
abajo que mover. Ese era el «no funciona nada».

Ahora, **con el modo rig abierto, un cuadro nuevo sostiene el mismo dibujo**.
Fuera del rig el botón sigue creando un dibujo nuevo, sin cambios.

## Un cuadro sin el personaje ya no se queda callado

Si caés en un cuadro donde el dibujo del personaje no está expuesto, la barra de
estado lo dice y explica cómo sostenerlo (**↔** en la hoja de tiempos), en vez
de dejar una mesa muerta sin explicación.

## Los topes de rotación ahora valen también posando a mano

Cada hueso tiene un tope mínimo y uno máximo —para que un codo no se doble para
el lado imposible— y el panel del rig ya dejaba fijarlos. Pero sólo el solver de
IK los miraba: **posar a mano en FK los ignoraba por completo**, así que el tope
no servía para nada en el gesto más usado.

Ahora los respetan los dos caminos, y el hueso se frena **mientras arrastrás**,
no al soltar: si sólo se corrigiera al final, el brazo pasaría de largo y después
pegaría un salto para atrás.

## El tutorial cuenta cómo se anima

**Ayuda → Cómo se riggea un personaje** suma la sección que faltaba: animar a lo
largo de los cuadros. Es la parte del flujo que el tutorial no cubría, y sin
ella el resto no alcanzaba.

## Curvas de interpolacion: el timing, aparte de las poses

La interpolacion era **solo lineal**. Sin ease ni curvas, todo lo que se animara
salia a velocidad pareja de punta a punta — mecanico, sin peso.

Ahora cada clave lleva dos manijas: una gobierna como **sale** hacia la clave
siguiente y otra como **llega** desde la anterior, igual que un cubic-bezier. En
el panel del rig hay una seccion **Curva** con el tramo donde estas parado, la
recta de referencia y la linea del cuadro actual, mas cinco presets: Recta,
Suave, Arranca lento, Frena y Escalon.

Las manijas se arrastran, y pueden salirse del marco a proposito: cuando una baja
de cero, el valor se pasa para el lado contrario antes de arrancar. Eso es la
**anticipacion**.

**Cambiar la curva no toca ninguna pose.** Se puede ajustar el timing cuantas
veces haga falta sin perder lo clavado.

Un detalle que casi lo deja invisible: la pose interpolada la termina decidiendo
el **canal**, que pisa el calculo de `rigPose`. Curvar solo el lerp de la pose no
hubiera cambiado un pixel; la curva se aplica en los dos lugares y viaja hasta el
canal cuando se sincronizan las claves.

## Sustituciones de dibujo: varios dibujos en una pieza

Una mano no rota, se cambia por otra mano. El modelo ya tenia slots y
attachments enteros, pero **la interfaz no exponia ni un control**, y ademas
`activeAttachmentId` era un valor unico: una sustitucion que no cambia por
cuadro no sirve para lo unico que se usa, que es la sincronia labial y los
catalogos de manos y pies.

Ahora una pieza puede tener varios dibujos y una clave por cuadro decide cual se
ve. Las claves viven en `rig.switches`, que estaba declarado en el modelo y sin
usar. Un dibujo no se interpola: vale desde su clave hasta la siguiente.

En el panel hay una seccion **Dibujos de la pieza**: se dibuja la otra version en
la mesa, se la selecciona, **Sumar dibujo**, y despues un clic en la lista la
muestra desde el cuadro donde estas parado. **Sin cambio aca** borra el cambio de
ese cuadro; **Quitar** saca el dibujo de la pieza sin borrarlo de la mesa.

Lo que habia que cuidar es que el rig no hornee su vista adentro del dibujo
guardado. Las variantes escondidas se marcan aparte y se devuelven como estaban
antes de serializar, asi que el archivo se guarda con todas sus versiones
visibles y nada oculto.

## El IK dice por que no llega

Con topes puestos, arrastrar el rombo podia dejar la mano corta sin ninguna
explicacion: no habia forma de saber si al brazo le faltaba alcance o lo estaba
frenando un tope. Ahora la barra de estado distingue las dos causas:

- *El objetivo esta mas lejos de lo que da el brazo (303 px contra 204 de
  alcance) · se estiro todo lo que pudo*
- *El tope de "antebrazo" no lo deja llegar · proba "Invertir" o amplia su limite*

El segundo cierra el circulo: se toca Invertir, el codo dobla para el lado
permitido y la mano llega con error 0 px.

## Un personaje de ejemplo adentro del programa

**Ayuda -> Abrir el personaje de ejemplo** arma un muneco de siete piezas ya
riggeado y animado: tres niveles de jerarquia, el dibujo sostenido a lo largo de
trece cuadros, un saludo de tres claves y un codo con topes. Se abre paso el
entorno solo —crea el lienzo y abre el dock de animacion si hacen falta— asi que
funciona incluso entrando desde el menu con el programa recien abierto.

Es la forma mas rapida de entender el flujo: en vez de armar un rig a ciegas para
recien ahi ver si anda, se abre uno que ya anda y se lo toca.

## Que se midio

Personaje de cuatro piezas —torso, brazo, antebrazo, mano— encadenado por los
pivotes, con el flujo completo ejercitado de punta a punta:

| caso | antes | ahora |
| --- | --- | --- |
| agregar 3 cuadros en modo rig | celdas 1,2,3,4 — el personaje desaparecía | celdas 1,1,1,1 — sigue expuesto |
| agregar cuadros fuera del rig | dibujo nuevo | dibujo nuevo (sin cambios) |
| cuadro sin el personaje | mesa muerta, sin aviso | la barra de estado explica qué falta |
| codo con topes −110°/0°, pedir −140° | se doblaba igual | se frena en −110° |
| el mismo codo, pedir 45° y 200° | se doblaba igual | se frenan en 0° |
| hueso sin topes, pedir 170° | 170° | 170° (sin cambios) |
| tramo F1=0° → F7=−68°, curva **recta** | −11.33 −22.67 −34 −45.33 −56.67 | igual (pasos parejos) |
| el mismo tramo, curva **suave** | — | −1.86 −10.14 −34 −57.86 −66.14 |
| el mismo tramo, **arranca lento** | — | −1.13 −4.87 −11.99 −23.62 −41.59 |
| el mismo tramo, **frena** | — | −26.41 −44.38 −56.01 −63.13 −66.87 |
| el mismo tramo, **escalón** | — | sostiene 0° y salta a −68° en F7 |
| volver a **recta** | — | vuelve al valor exacto, sin deriva |
| manija arrastrada bajo el marco | — | F2 = **+1.09°** (anticipación) y las poses F1/F7 intactas |
| guardar y abrir con curvas | — | los valores vuelven idénticos tras el viaje por JSON |
| IK con el codo topado | se quedaba corto, sin explicación | dice cuál tope lo frena y qué hacer |
| IK con objetivo a 303 px y alcance 204 | se quedaba corto, sin explicación | dice que falta alcance, con los números |
| tras tocar «Invertir» | — | llega con error **0 px** respetando el tope |
| el ejemplo desde el menú, con el programa recién abierto | — | crea el lienzo, abre el dock y arma las 7 piezas |
| dos manos en una pieza, cambio clavado en F5 | imposible: sin interfaz y sin claves | F1 la abierta · F5 y F9 el puño |
| guardar con una variante escondida | — | el archivo sale **sin** `display:none` y con las dos manos |
| ida y vuelta por JSON con sustituciones | — | claves, variantes y resolución por cuadro vuelven idénticas |
| quitar el dibujo que la pieza estaba usando | se veían los dos a la vez | la pieza pasa al que queda, con su matriz |
| quitar el único dibujo de una pieza | — | no se permite, y lo dice |

Y lo que quedó confirmado con medición en el mismo pasaje, que ya funcionaba:

| qué | medición |
| --- | --- |
| cadena FK | rotar el brazo 84° arrastra antebrazo y mano; el torso no se mueve |
| interpolación | claves en F1=84.3° y F5=−45° dan F3=19.64° contra 19.65° teórico |
| el dibujo sigue al modelo | ángulo del `<rect>` idéntico al del modelo en los 5 cuadros |
| IK de dos huesos | 4 objetivos alcanzables, error **0 px** en los 4 |
| IK fuera de alcance | estira la cadena al máximo hacia el objetivo, sin romperse |

Animación completa de 9 cuadros con 3 claves (F1, F5, F9): los 6 cuadros
intermedios salen interpolados y la mano describe un arco continuo
(606,233 → 373,75 → 550,362).
