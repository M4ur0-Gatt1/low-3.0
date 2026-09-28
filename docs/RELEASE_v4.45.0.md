# LOW v4.45.0 — El giro de cabeza con dibujos, y la cara armada de una vez

Esta versión entrega las dos etapas de actuación del plan: **C04** (giro de
cabeza mediante vistas dibujadas) y la parte de código de **C05** (conjuntos
reutilizables de controles). Las dos quedan listas para lo único que no se
puede medir desde el código: probarlas con una cara dibujada.

## C04 · Giro de cabeza por vistas dibujadas

Una cabeza no gira interpolando: gira porque alguien dibujó el frente, el tres
cuartos y el perfil. Las sustituciones por slot ya existían, pero había que
**clavar una por cuadro**, que es justo el trabajo manual que un control de
actuación viene a sacar.

- **Juego de vistas**: ata un slot a un control. Cada dibujo dice en qué punto
  del giro manda, y animando el control aparece el que toca.
- La elección es **discreta**: dos dibujos no se mezclan. Manda el más cercano,
  y el empate cae siempre en el de valor menor, para que el mismo valor dé
  siempre el mismo dibujo.
- El **orden de slots viaja con la vista**: de perfil la nariz cruza la cara y
  lo que estaba atrás pasa adelante.
- **Correctivos por vista**: al girar, las piezas de encima no caen solas en su
  lugar — de tres cuartos el ojo se corre y la oreja se achica. Cada vista lleva
  su ajuste por pieza, que se suma en el mismo lugar donde se suman las acciones
  (así componen), vale entero mientras esa vista manda y desaparece al cambiar.
  No se interpola, porque el dibujo tampoco se interpola.

### Lo que NO hace, a propósito

El plan lo pide con todas las letras: *no presentar un giro 360 automático si
faltan vistas*. El panel dice, en cada estado, la verdad medida:

| Estado | Lo que dice |
|---|---|
| vacío | agregá el primer dibujo como vista |
| 1 vista | con un solo dibujo no hay giro |
| frente + perfil | Dibujado de 0 a 90 · **FALTA dibujar hasta −90**: fuera de eso se sostiene el extremo, no es un giro completo |

Además avisa de los saltos entre vistas que se van a notar. El umbral quedó en
45° y no en 30° a propósito: 45° es el espaciado normal de un giro —frente,
tres cuartos, perfil— y avisar ahí sería dar un mal consejo.

## C05 · Conjuntos de controles

Armar la actuación de un personaje a mano es repetir siempre lo mismo. Un
conjunto es esa receta escrita una vez: **ojos, cejas, boca y manos**.
Aplicarlo crea los controles y, para cada pieza, el juego de vistas de C04
esperando los dibujos — se apoya en lo que ya hay, no inventa otro mecanismo.

La parte que importa es la **vinculación explícita a cada personaje**:

- el mapa rol→pieza está **a la vista**, un desplegable por rol;
- *Sugerir piezas* completa lo que reconoce por el nombre, pero se corrige a
  mano: es una ayuda, no una decisión que se toma por uno;
- **aplicar queda apagado** mientras falte vincular alguno, y si igual se llama
  por comando no aplica nada y devuelve qué falta — nunca a medias;
- una pieza vinculada que no existe también frena, porque mentiría.

Lo aplicado queda escrito en la escena: qué conjunto, sobre qué piezas y con
qué controles. Si después se borra una pieza, el vínculo **se señala en vez de
limpiarse** — borrarlo escondería que esos controles quedaron huérfanos.

Los recorridos no son decorativos: un párpado va de 0 a 100 porque así se
piensa un parpadeo, la mirada de −100 a 100 porque tiene dos lados y un centro,
y el valor por defecto es siempre la pose neutra, para que aplicar un conjunto
no deforme al personaje.

## Verificación

- ✅ 14 suites del modelo, incluidas las dos nuevas: `run_view_sets_tests`
  (36 pruebas) y `run_control_sets_tests` (29).
- ✅ 13 puentes y contratos de Python, incluido el presupuesto de `app.js`.
- ✅ 55 recorridos de interfaz en Chromium, con dos nuevos:
  `check_giro_vistas_ui` y `check_conjuntos_ui`.
- ✅ **15 mutaciones verificadas** en esta tanda, cada una con navegador nuevo.
  Las que más importan son las que cuidan las prohibiciones del plan: ocultar el
  aviso de lo que falta dibujar, decir que hay giro con una sola vista, y dejar
  aplicar un conjunto sin vincular las piezas. Las tres hacen caer una prueba.
- ✅ Los dos paneles medidos en pantalla con el cajón de animación abierto como
  lo abre la aplicación: entran en 224 px sin desborde horizontal.

## Límites de esta versión

- ⏳ **Falta la revisión artística de C04 y C05**, y es lo que decide si esto
  sirve: si el giro se lee, si los recorridos elegidos son los que se usan al
  animar y si los correctivos alcanzan. Se puede medir que el ojo se corre
  12 px; no se puede medir que la cara actúe.
- ⏳ **C05 no guarda conjuntos propios**: están los cuatro de fábrica. Falta
  decidir si los conjuntos que uno arma viven en la máquina o junto al proyecto,
  y esa decisión cambia si se comparten o no.
- ⏳ No hay un «grabar corrección» automático para las vistas. Se dejó afuera:
  el gesto natural escribe en la pose propia de la pieza, que vale para todas
  las vistas, y pasar eso al correctivo sin sacarlo de la pose lo aplicaría dos
  veces. Esa cuenta se mide con un personaje real, no antes.
- ⏳ `check_rig_control_ui` falla **localmente** cuando corre después de los
  otros 54 recorridos, y pasa aislado y en CI. Verificado sobre el árbol limpio
  de v4.43.1: es **preexistente**, no de estos cambios, y no se pudo atribuir al
  producto.
- ⏳ Validación humana con tableta, pendiente como en las versiones anteriores.
