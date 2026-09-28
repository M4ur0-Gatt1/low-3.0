# LOW v4.41.1 — el arranque clavado y las herramientas escondidas

Tres cosas que reportó Mauro sobre la v4.41.0 recién instalada. Las dos primeras
eran defectos míos, y una dejaba el programa inservible.

## 1. «Lo cerré y lo volví a abrir y quedó clavado»

La pantalla de inicio pinta «Nuevo documento» y «Abrir documento…» **apagados a
propósito**: al arrancar todavía no está Python, y un botón visible que no hace
nada es peor que uno apagado. Cuando el puente termina, `habilitar()` los prende
y saca el «Preparando LOW…».

Pero eso corría **una sola vez, en el arranque**. La invitación se vuelve a
pintar cada vez que la mesa queda vacía —al cerrar el documento, al volver de la
IA— y esa copia nueva nacía muerta **para siempre**: las dos acciones sin
responder, y con ellas **«Recuperar lo que quedó sin guardar»**. LOW quedaba
inservible sin haberse roto nada, y el trabajo sin guardar, inalcanzable desde
esa pantalla.

Ahora el puente se recuerda: toda invitación pintada después del arranque nace
usable. (El detalle que costó la primera vuelta: `habilitar()` busca la tarjeta
**en el DOM**, así que tiene que correr *después* de meterla, no antes.)

## 2. «Cuando elijo el panel de animación no se ven las herramientas»

Medido en una ventana de 1000×560 —media pantalla, como trabaja él—: el riel
tenía **11 herramientas a la vista** y al pasar al espacio de Animación quedaban
**6**, con veintiséis en el cajón «⋯». No es un misterio: el riel reparte por
**alto**, y la timeline le come la mitad.

Ahora el riel **se parte en columnas** —dos, y hasta tres— antes de esconder
nada, como Photoshop, Moho y OpenToonz. Medido en el mismo tamaño: **14 de 14**
a la vista en Animación. Esconder queda como último recurso, y lo que uno fija
con clic derecho sigue mandando sobre cualquier cálculo.

## 3. «Se está activando sola una herramienta pincel sin que nadie la elija»

Esto no lo pude reproducir, y conviene decirlo derecho. Mirando de dónde puede
salir, el pincel sólo se enciende por cuatro caminos: el botón del riel, la
paleta de comandos, el puente del agente… y la **tecla B**. Los tres primeros
necesitan un clic; el cuarto no, y las ExpressKeys de una tableta mandan teclas.

Así que ahora, cuando una herramienta cambia por teclado, **lo dice**: «Pincel ·
lo pidió la tecla «B» (cambiala en Preferencias → atajos)». Si vuelve a pasar,
el aviso distingue en el acto un defecto del programa de un botón del lápiz. Si
aparece sin ese aviso, es mío y lo busco con ese dato.

## Pruebas

- **`check_riel_herramientas_ui.js`, nueva y en CI**: mide el riel **a 1000×560**
  —a 1366×768 entran todas y no probaría nada— y exige que entrar al espacio de
  Animación no cueste ni una herramienta. Mutación verificada.
- **`check_pantalla_inicial_ui`** ahora exige que la invitación **repintada**
  tenga sus acciones vivas y sin «Preparando LOW». Mutación verificada.
- **Cuatro contratos estáticos nuevos** (305 en total), verificados por mutación.
- **Una prueba que fallaba a veces**: `check_perf_budgets` usaba
  `LOW.workspace.workspaces` sin esperar a que existiera y, bajo carga, moría con
  «Cannot read properties of undefined». Espera por la condición.

## Reversión

Estable previa: `v4.41.0` (misma versión donde apareció el arranque clavado: si
hay que volver, el punto seguro es `v4.39.0`). Lo de esta versión son líneas
plegadas en `ui/app.js`, `ui/application/pantalla-inicial.js` y
`ui/design/studio-polish.css`.
