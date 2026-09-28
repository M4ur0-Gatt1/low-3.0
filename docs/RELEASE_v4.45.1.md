# LOW v4.45.1 — Los cuatro defectos que salieron de usar la v4.45.0

Versión de corrección. Todo lo de acá salió de Mauro probando la v4.45.0 en su
máquina, no de imaginar casos. El primero explica solo a los otros dos que él
había descrito por separado.

## 1. Un vendor que no cargaba dejaba la aplicación a medio armar

Su log, con la v4.45.0 recién instalada:

```
── arranque ── LOW v4.45.1 · python 3.13.15 · win32 · CONGELADO
[js] init: CodeMirror is not defined
[fallo] fallo-20260919-210512.json
```

y lo que él vio fue otra cosa: *«el sistema de selección se rompió, no
selecciona bien, arrastrando no selecciona nada, la pantalla de inicio se queda
clavada»*, y después *«las herramientas no andan»*.

**Una causa, todos esos síntomas.** `init()` es UNA función y
`cm = CodeMirror(...)` está en su **tercera línea**: al tirar ahí no corrió nada
de lo que viene después —el cableado de selección, el de las herramientas, los
paneles, el propio «init ok»—. Un archivo que no cargó se ve, desde afuera, como
una aplicación a medio armar que además no avisa. Al relanzar arrancó bien, así
que la carga falla de a ratos: primer arranque después de instalar.

Ahora se **reintenta** el vendor (y sus modos de coloreado, que habían caído en
cascada llamando a `defineMode` sin base) y, si aun así no está, se pone un
editor **inerte** con la misma forma que la aplicación usa —trece métodos,
medidos sobre el código— para que `init()` siga de largo. El área del editor lo
dice; el resto de LOW funciona.

Aclaración sobre el log, porque confunde: **`CONGELADO` no significa colgado**,
es el modo de compilación. Aparece también en los arranques que salieron bien.

## 2. Cartel doble

`tool-help.js` arma su globo **leyendo el `title`**, y el navegador mostraba
además su tooltip nativo del mismo `title`: dos carteles idénticos, uno encima
del otro. Ahora se saca el `title` mientras el globo está a la vista y se
devuelve al ocultarlo — no se borra para siempre, porque es lo que leen los
lectores de pantalla y de donde sale el texto del propio globo.

## 3. Un pincel quedaba puesto encima del esqueleto

Medido: con el rig encendido el riel sigue ofreciendo las 17 herramientas de
dibujo y `dzSetTool()` las aceptaba sin preguntar, así que el gesto de mover una
articulación pintaba. El contrato existía y no se usaba: `mode-machine.js` es «la
autoridad sobre qué herramientas son válidas en dibujo y rigging», pero
`dzSetTool` nunca la consultaba.

Ahora elegir una herramienta de dibujo con el esqueleto puesto **sale del rig, la
aplica y lo dice**. No se rechaza: el botón dice «pincel» y quien lo aprieta
quiere pintar; un botón muerto es otro defecto. Selección, mano, pivote y las de
rig no sacan del modo.

## 4. Poner el esqueleto de ejemplo borraba el dibujo sin preguntar

*«Al colocar el esqueleto entero borra el personaje, eso no debe pasar.»* Cierto,
y era pérdida de datos: el ejemplo entra por `dzCanvasSet`, que pisa el lienzo, y
la confirmación aparecía **sólo** si el documento estaba sucio o tenía más de un
cuadro. Un personaje ya guardado, de un solo cuadro, se reemplazaba en silencio.

Ahora se pregunta siempre que haya algo **dibujado** en la mesa, y el aviso dice
lo que de verdad pasa: que reemplaza, que no se superpone y que se va aunque esté
guardado. Saber si «hay dibujo» no es mirar si el SVG tiene hijos: adentro del
lienzo viven las capas de asistencia del editor y ninguna es dibujo.

## Verificación

- ✅ 14 suites del modelo y 13 puentes/contratos.
- ✅ **58 recorridos** de interfaz, con tres nuevos:
  `check_arranque_sin_vendor_ui` —que **bloquea el vendor a propósito** y exige
  que la selección siga viva—, `check_rig_herramienta_ui` y
  `check_ejemplo_no_borra_ui`.
- ✅ **Ocho mutaciones verificadas** en esta tanda, cada una con navegador nuevo.
- ✅ `check_rig_flujo_ui` y `check_rig_skeleton_ui` se pusieron en rojo al
  agregar la confirmación del punto 4, porque abren el ejemplo: se les agregó el
  clic de aceptar. Que hayan fallado es la prueba de que la guarda entra en el
  recorrido real.

## Lo que NO entra en esta versión

- ⏳ **Una pieza que no queda asociada a su hueso** («uno de los brazos»). No se
  pudo reproducir todavía: con la captura no alcanza para saber si la pieza quedó
  sin binding o si su `id` choca con otro. Hace falta el `.low` del personaje.
- ⏳ **Colocar un esqueleto SOBRE el dibujo** para vincularlo después. Es una
  función nueva, no un arreglo: hoy lo único que existe es el ejemplo completo,
  que trae su propio arte. Queda planteada.
- ⏳ La revisión artística de C04 y C05 (v4.45.0), que sigue pendiente.
- ⏳ `check_rig_control_ui` falla localmente al correr después de los otros 57 y
  pasa aislado y en CI: preexistente de v4.43.1.
