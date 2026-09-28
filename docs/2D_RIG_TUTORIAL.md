# Rig 2D de LOW — cómo se usa (v3.29.50)

Este documento explica el flujo **tal como está implementado**. Al final está
el estado de los seis problemas que encontré al revisarlo: cuatro arreglados en
la v3.29.48 y dos que siguen abiertos.

El mismo tutorial vive dentro del programa, en **Ayuda → Cómo se riggea un
personaje**.

---

## La idea de fondo: acá hay una sola entidad

En Harmony y en OpenToonz hay **dos sistemas separados**: la jerarquía de
cut-out (capas/columnas con pegs) por un lado, y los deformadores o el
esqueleto (Bone/Curve, Plastic) por otro.

En LOW hay **una sola cosa**: el *nodo de rig*. Todo lo que ves en el panel —
`pieza_9`, `hueso_35`— es el mismo tipo de objeto, con estos campos:

| campo | qué es | cuándo aparece |
| --- | --- | --- |
| `pivot` | el punto sobre el que rota | siempre |
| `head` / `tail` | los dos extremos del hueso | solo si lo creaste con **Crear hueso** |
| `parentId` | de quién cuelga | cuando lo vinculás |
| `elementId` | qué dibujo arrastra | cuando lo vinculás al arte |
| `keys` | las poses por cuadro (x, y, rot, escala) | al clavar |
| `pinned` | si es la raíz | con **Fijar raíz** |

Que sea una sola entidad tiene una consecuencia práctica: **un nodo se comporta
distinto según cómo lo creaste**, y nada en pantalla lo aclara. Un nodo hecho
con "Registrar piezas" no tiene `head`/`tail`, así que no tiene cuerpo de hueso
para agarrar: solo se lo puede posar desde su articulación. Uno hecho con
"Crear hueso" sí.

---

## Los dos caminos para armar el rig

### Camino A — Cut-out por piezas (el que se parece a OpenToonz)

Sirve cuando el personaje **ya está dibujado por partes separadas**.

1. **Dibujá o importá el personaje con cada parte como una pieza aparte.** Una
   pieza es un hijo directo del SVG del dibujo. Si todo el personaje es un solo
   trazo, no hay nada que riggear: primero separalo.
2. **Armado → Registrar piezas del dibujo.** Registra *todas* las piezas de una
   vez. Cada una queda con su pivote en el centro de su caja y **sin padre**.
   El contador de arriba te dice cuántas registró.
3. **Colocá el pivote de cada pieza.** Seleccionala, tocá **Pivote** y hacé
   clic donde tiene que girar: para un brazo, el hombro. El punto va a la pieza
   **elegida** aunque el clic caiga encima de otra — el hombro está sobre el
   torso, y eso es lo normal. **Alt+clic** lo saca. Si no hay nada elegido, el
   pivote va a la pieza que esté bajo el clic; si ahí no hay ninguna, la barra
   de estado lo dice en vez de quedarse callada.
4. **Armá la jerarquía.** Dos formas, hacen lo mismo:
   - el desplegable **Cuelga de** del panel, o
   - arrastrar el **cuadradito** del nodo seleccionado hasta el **círculo**
     (pivote) del que va a ser su padre. Soltarlo en un área vacía rompe el
     vínculo.
5. **Fijá la raíz** (normalmente la cadera o el torso) con **Fijar raíz**: se
   dibuja como un círculo más grande.
6. Pasá a **FK** y posá.

### Camino B — Cadena de huesos (el que se parece a Moho/Harmony deformers)

Sirve cuando querés una cadena articulada, con o sin piezas separadas.

1. **Armado → Crear hueso.**
2. **Arrastrá desde la articulación hasta la punta.** Eso crea un hueso.
3. **Para continuar la cadena, empezá el siguiente arrastre cerca de la punta
   del anterior** (a menos de 18 px en pantalla): se engancha solo y queda como
   hijo. Si empezás lejos, nace suelto como raíz.
4. Al crear el hueso, LOW **vincula solo** el dibujo que esté debajo de la
   articulación, mirando la tinta real. Si querés cambiarlo, seleccioná la pieza
   en la mesa, seleccioná el hueso y tocá **Mueve el dibujo**.
5. Pasá a **FK** y posá.

Los dos caminos se pueden mezclar en el mismo personaje, y eso es parte de por
qué el panel se vuelve confuso: terminás con piezas y huesos en la misma lista.

### El pivote de un hueso

Arrastrar el círculo de un hueso mueve **el hueso entero**: es el gesto para
acomodar la cadena. Para correr solo su **pivote**, arrastralo con **Alt**
apretado, o usá el botón **Pivote** con el hueso elegido.

### Animar a lo largo de los cuadros

Un personaje riggeado se anima **con poses, no redibujándolo**: el mismo dibujo
se sostiene a lo largo de la escena y lo que cambia cuadro a cuadro son las
claves del rig. Por eso, con el modo rig abierto, **agregar un cuadro sostiene
al personaje** en vez de dar una hoja en blanco. Fuera del rig el botón sigue
creando un dibujo nuevo, como siempre.

Poné una pose cada tantos cuadros: LOW rellena el medio solo. Si caés en un
cuadro donde el personaje no está expuesto no hay nada que posar, y la barra de
estado lo dice en vez de quedarse callada; se arregla sosteniendo su dibujo con
**↔** en la hoja de tiempos.

### El timing: curvas de interpolacion

Las claves dicen **que** pose y **cuando**; la curva dice **como** se va de una
a la otra. Sin curva el movimiento sale a velocidad pareja de punta a punta, y
eso es lo que hace que una animacion parezca mecanica.

La seccion **Curva** del panel muestra el tramo donde estas parado, con la recta
de referencia punteada y la linea vertical del cuadro actual. Los cinco botones
son los timings de siempre: **Recta**, **Suave**, **Arranca lento**, **Frena** y
**Escalon** (sostiene la pose entera y salta en la clave siguiente). Para
afinarlo, arrastra las dos manijas.

Si llevas una manija **por debajo del marco**, el valor se pasa para el otro lado
antes de arrancar: eso es la **anticipacion**, y es la razon por la que las
manijas pueden salirse del cuadrado.

Cambiar la curva **no toca ninguna pose**: se puede ajustar el timing todas las
veces que haga falta sin perder lo clavado.

### Tres pasos: Construir, Probar y Animar

Arriba del panel hay tres botones que ordenan todo el sistema.

**Construir** arma el muneco: registrar piezas, mover pivotes, decir de quien
cuelga cada una, poner topes, dar curva. Aca **no se crean claves** — nada de lo
que toques queda grabado en la animacion, y la manija de posar ni siquiera
aparece en la mesa.

Cada dibujo pertenece a un solo hueso. **Vincular** transfiere la pieza al hueso
elegido si antes estaba en otro; **Soltar** elimina el vínculo sin borrar ni el
dibujo ni el hueso.

**Probar** permite mover el esqueleto sin crear claves ni alterar la pose neutra.
Escape cancela la prueba y devuelve el personaje a su estado anterior. Este paso
sirve para comprobar jerarquia, pivotes y reparto antes de empezar una toma.

**Animar** posa. La herramienta de posar queda puesta sola y cada gesto deja una
clave en el cuadro donde estes parado. Los controles de armado desaparecen, asi
no se rompe el rig sin querer.

Dentro de Animar se elige **como** posar: **Directa** rota cada pieza por su
pivote y los hijos siguen; **Inversa** deja arrastrar la punta y acomoda la
cadena sola. El renglon bajo los botones dice siempre que gesto hace que.

Antes habia tres modos hermanos —Armado, FK, IK— mas tres herramientas, y nada
indicaba si estabas construyendo o animando.

### Varios dibujos en una misma pieza

Una mano no rota: se **cambia** por otra mano. Lo mismo el pie, o la boca en la
sincronia labial. Por eso una pieza puede tener varios dibujos, y el cuadro
decide cual se ve.

Dibuja la otra version en la mesa, seleccionala, y con la pieza elegida toca
**Sumar dibujo** en la seccion **Dibujos de la pieza**. Despues, parado en el
cuadro donde tiene que cambiar, hace clic en el dibujo de la lista: vale **desde
ahi hasta el proximo cambio**. Un dibujo no se interpola.

**Sin cambio aca** borra el cambio de ese cuadro y deja que siga mandando el
anterior. **Quitar** saca el dibujo de la pieza sin borrarlo del dibujo: si era
el que la pieza estaba usando, la pieza pasa a usar el que queda.

### Doblar una pieza

Una pieza rigida solo **rota**: sirve para un brazo, no para el pelo, una cola o
una manga. Con **Dar curva** la pieza pasa a doblarse.

Aparecen tres puntos verdes sobre el dibujo. Arrastralos y la pieza se dobla
siguiendo esa curva; el doblez queda clavado en el cuadro donde estas, asi que
se anima como cualquier otra cosa. **Sin doblez aca** borra el de ese cuadro;
**Quitar curva** devuelve la pieza a rigida y el dibujo a su forma.

Para poder doblarse la pieza pasa de forma a **trazo** —un rectangulo no se
dobla—. El programa lo hace solo al dar la curva y lo avisa. El grosor del dibujo
se mantiene: lo que cambia es por donde pasa.

### El personaje de ejemplo

**Ayuda -> Abrir el personaje de ejemplo** (o el boton al principio del tutorial
dentro del programa) arma un personaje frontal completo de dieciocho piezas ya
riggeado y animado: cabeza, cuello, torso, pelvis, hombros independientes,
brazos, antebrazos, manos, muslos, piernas y pies. Incluye varios niveles de
jerarquia, el dibujo sostenido a lo largo de trece cuadros y un saludo de tres
claves. Sirve para seguir estos pasos
tocando algo que ya funciona en vez de armarlo a ciegas.

---

## Los tres modos

| modo | para qué | qué herramientas quedan activas |
| --- | --- | --- |
| **Armado** | crear, pivotes, jerarquía | Seleccionar, Crear hueso (Posar queda apagado) |
| **FK** | posar articulación por articulación | Seleccionar, Posar (Crear hueso queda apagado) |
| **IK** | mover un extremo y que la cadena resuelva | Seleccionar, Posar |

Cambiar de modo cambia la herramienta sola, a propósito: al entrar en FK o IK
queda **Posar** para que arrastrar ya pose sin un paso extra.

### Posar en FK

- Arrastrar la **manija** —la línea punteada que sale del pivote hacia el propio
  dibujo— → **rota** la pieza. En un hueso, además sirven su cuerpo y su punta.
- Arrastrar la **articulación** (el círculo) → **mueve**, y los hijos siguen.
- El **pivote** no se toca en FK: se cambia en **Armado**.
- Con **Auto-clave** tildado, cada gesto deja una clave en el cuadro actual.
  Destildado, podés probar sin grabar: **Enter** clava, **Esc** descarta.

### Posar en IK

1. Elegí **Hombro**, **Codo** y **Extremo** en los tres desplegables. Tienen que
   ser tres nodos **consecutivos** de la misma cadena, cada uno con pivote.
2. **Crear IK**.
3. Arrastrá el **rombo** verde en la mesa. Los dos huesos se clavan en una sola
   operación.
4. **Invertir** cambia el lado hacia el que flexiona el codo.

---

## Qué significa cada símbolo en la mesa

| símbolo | qué es |
| --- | --- |
| **círculo** chico | el pivote / articulación del nodo |
| **círculo grande** | la raíz (nodo fijado con *Fijar raíz*) |
| **línea** entre dos puntos | el cuerpo de un hueso (solo los creados con *Crear hueso*) |
| **círculo en la punta** | el extremo del hueso: de ahí sale la cadena |
| **cuadrado** con un brazo | el tirador de vínculo **del nodo seleccionado**: arrastralo al pivote del padre |
| **rombo** | el objetivo de una cadena IK |
| texto | el nombre del nodo |

---

## Equivalencias con lo que ya conocés

| en Harmony | en OpenToonz | en LOW hoy |
| --- | --- | --- |
| jerarquía en Timeline / Node view | parenting por columna en la Xsheet | **Cuelga de**, o arrastrar el **cuadrado** al **círculo** del padre |
| peg de la capa | pegbar de la columna | el nodo del rig (no hay peg aparte) |
| pivote con la Transform Tool | *center* con la Animate Tool | botón **Pivote** |
| Transform Tool para animar | Animate Tool | modo **FK** + herramienta **Posar** |
| Deformers (Bone / Curve) | Plastic / Skeleton | **Crear hueso** (misma entidad que las piezas) |
| claves en la timeline de la capa | claves en la columna | **Clave** / **Clave global** / **Auto-clave** |

La diferencia grande: en Harmony y OpenToonz **la jerarquía se arma en la
timeline**, y en LOW se arma **en el canvas**. Si venís de esos programas, ese
es el paso que no vas a encontrar donde lo buscás.

---

## Estado de los problemas que encontré

### Arreglados en la v3.29.48

**El auto-vínculo agarraba la pieza equivocada.** `dzRigArtAtPoint` recorría las
piezas *en orden de dibujo* y devolvía la primera cuyo **rectángulo envolvente**
contenía el punto. En un personaje, la primera pieza suele ser el cuerpo y su
rectángulo cubre casi todo: los huesos de la pata, la oreja o la mano terminaban
vinculados al cuerpo. Ahora mira la **tinta real** con `elementsFromPoint`, y si
el punto cae en un hueco elige la **caja más chica** que lo contenga, nunca la
primera. Medido sobre un cuerpo de 400×400 con una mano de 60×60 encima:
apuntando al centro de la mano, antes devolvía `cuerpo` y ahora devuelve `mano`.

**La mesa se saturaba de pivotes.** Registrar las piezas de un personaje deja
decenas de círculos encima del dibujo. Ahora, cuando hay más de ocho nodos, los
que no son el seleccionado ni su familia directa se **atenúan** y se achican.
Siguen estando y se siguen agarrando igual: el área invisible de agarre no
cambió.

**«Vínculo» nombraba dos cosas.** El desplegable pasó a llamarse **Cuelga de**
(la jerarquía) y el botón, **Mueve el dibujo** (qué arte arrastra el hueso).

**La pieza perdía su nombre.** Al crear un hueso sobre una pieza sin `id`, la
pieza adoptaba el nombre del hueso y el dibujo pasaba a llamarse `hueso_12`.
Ahora recibe nombre de pieza (`pieza_3`).

### Arreglados en la v3.29.50

**La rotación iba para el lado contrario.** Una pieza no tiene cuerpo de hueso,
así que el único asidero para rotarla era la línea que va **del pivote del padre
al suyo** — una línea que sale del torso, no del brazo. Agarrarla y bajarla
hacía **subir** el brazo, como una palanca tomada del lado equivocado (medido:
un arrastre hacia abajo daba −40°, antihorario). Y una pieza **sin** padre no
tenía ninguna línea, así que no se podía rotar en la mesa.

Ahora cada pieza tiene su propia **manija de rotación**, que sale del pivote
hacia su dibujo: se agarra la pieza y gira hacia donde uno la lleva (medido: el
mismo arrastre hacia abajo ahora da +69.6°, horario, y el brazo cuelga desde el
hombro). La línea al padre queda solo como indicador de jerarquía.

### Arreglados en la v3.29.49

**El pivote se lo llevaba la pieza equivocada.** El botón **Pivote** decía "hacé
clic donde articula la pieza seleccionada", pero `dzPivotClick` se lo ponía a la
pieza que estuviera **bajo el cursor**. Como el pivote de un brazo va en el
hombro —y ahí abajo lo que hay es el torso—, el punto se lo llevaba el torso y
el brazo seguía girando por el medio, como si el clic no hubiera pasado. Ahora
manda lo que está elegido.

**Y si el clic no caía en ninguna pieza, no pasaba nada ni se avisaba.** Era un
`return` mudo. Ahora la barra de estado explica qué falta.

**El pivote de un hueso no se podía mover.** Arrastrar su articulación movía
siempre el hueso entero, y el botón Pivote solo actuaba sobre piezas del dibujo:
no había ninguna forma de correr el pivote de un hueso. Ahora **Alt+arrastrar**
mueve solo el pivote (verificado: el pivote pasó de 511,239 a 551,279 con la
cabeza y la punta del hueso intactas).

### Arreglado en la v3.29.51

**Agregar cuadros vaciaba la escena y el rig se quedaba sin nada que mover.** El
botón de cuadro nuevo creaba un dibujo en blanco, así que apenas se extendía la
animación el personaje desaparecía y ningún control del rig tenía efecto — la
causa concreta de «no funciona nada». Con el modo rig abierto, un cuadro nuevo
ahora sostiene el mismo dibujo. Fuera del rig no cambia nada.

**Un cuadro sin el personaje no avisaba.** Ahora la barra de estado explica que
ese cuadro no lo tiene expuesto y cómo sostenerlo.

### Nuevo en la v3.29.51: curvas de interpolacion

La interpolacion era **solo lineal**: no habia ease, ni Bezier, ni editor de
curvas, asi que todo movimiento salia mecanico. Ahora cada clave lleva dos
manijas —como sale hacia la siguiente y como llega desde la anterior, igual que
un cubic-bezier— con cinco presets y un editor grafico en el panel.

El detalle que importaba para que se notara: la pose interpolada la termina
decidiendo el **canal**, que pisa al calculo de `rigPose`. Curvar solo el lerp
de la pose no hubiera cambiado nada en pantalla; la curva se aplica en los dos
lugares.

### Nuevo en la v3.29.51: sustituciones de dibujo

El modelo ya tenia slots y attachments enteros, pero la interfaz no exponia ni
un control, y `activeAttachmentId` era un valor unico: una sustitucion que no
cambia por cuadro no sirve para sincronia labial. Ahora las claves de
sustitucion viven en `rig.switches` —que estaba declarado y sin usar— y el panel
las maneja.

Lo que habia que cuidar: el rig **nunca** puede hornear su vista dentro del
dibujo guardado. Las variantes escondidas se marcan con `data-rig-var` y
`dzRigStrip` las devuelve como estaban; `dzCanvasInner` pasa por ahi antes de
guardar, asi que el dibujo se guarda con todas sus versiones visibles.

### Nuevo en la v3.29.52: deformadores de curva

`binding.mode` ya aceptaba `curve`, `envelope`, `warp` y `weightedMesh`, pero el
unico modo implementado era `rigid`: nada se doblaba. Ahora una pieza puede
llevar una curva de control de tres puntos, animable por cuadro.

Como funciona: cada punto del dibujo se guarda en coordenadas curvilineas
respecto de la curva EN REPOSO —cuanto avanza a lo largo y cuanto se separa en
perpendicular— y se lo vuelve a colocar sobre la curva POSADA con las mismas
coordenadas. Si las dos curvas son iguales el dibujo no se mueve, que es por que
dar una curva no cambia nada hasta que se la toca.

Doblar no es transformar: hay que **reescribir la geometria**. El `d` original se
guarda en `data-defbase` y `dzRigStrip` lo devuelve antes de serializar, asi que
el doblez tampoco se hornea en el dibujo guardado.

### Siguen abiertos

**Piezas y huesos comparten lista y símbolo**, pero se posan distinto: el
nodo-pieza no tiene cuerpo que agarrar, solo su articulación. Nada en pantalla
dice cuál es cuál. Falta un ícono distinto en la lista y una acción de «darle
hueso a esta pieza».

**La jerarquía de los huesos no se lee de un vistazo.** Ojo con esto, porque mi
primera lectura fue incorrecta: para una **pieza** con padre, el overlay **sí**
dibuja la línea que la une a él. Lo que no se ve es la relación entre un
**hueso** y su padre, porque ahí la línea ya está ocupada dibujando el cuerpo
del hueso.
