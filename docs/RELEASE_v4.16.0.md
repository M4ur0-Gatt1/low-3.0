# LOW v4.16.0 — app.js deja de crecer

El punto 7 de §12 AHORA pide extraer `app.js` desde hace versiones. Mientras
nadie miraba el número, cada función nueva lo hacía **crecer**: la sesión que
agregó el panel de equipo y los arcos le sumó unas 850 líneas. Un punto abierto
que además iba para atrás.

## La regla, en una línea

> **`app.js` no puede crecer.** Cada trabajo se lleva un pedazo afuera al salir.

Y una puerta que la hace cumplir, porque una regla sin puerta es una intención:
`tools/check_app_js_budget.py`, en CI. El techo vive en `docs/APP_JS_BUDGET`.

- Si `app.js` **pasa** el techo, falla y dice cuántas líneas hay que sacar.
- Si queda **por debajo**, el techo se ajusta solo al nuevo valor y avisa que
  hay que commitearlo. Así el terreno ganado no se puede volver a perder en
  silencio.

Verificado agregando cinco líneas: informa «6 líneas de más» y devuelve 1.

## Primeras dos extracciones

| | líneas |
|---|---|
| `ui/panels/colab-panel.js` — el panel de equipo | 370 |
| `ui/panels/arcs-view.js` — los arcos sobre la mesa | 230 |

`app.js` pasa de **18.650 a 18.050** líneas. Concentra el 32,7 % del frontend
—75 módulos aparte suman 37.231 líneas—, contra el 33,4 % de antes. Es un primer
paso chico y honesto: lo que cambia el rumbo es la puerta, no estas 600 líneas.

Se eligieron esos dos bloques a propósito: son de esta misma tanda, los entiendo
enteros, y **cada uno ya tenía su recorrido E2E**. La prueba de que la extracción
no rompió nada no es leer el diff, es que `check_colab_ui.js` y `check_arcs_ui.js`
siguen pasando contra el servidor y la mesa de verdad.

## Una decisión que conviene explicar

Estos módulos **no** son IIFE con namespace como los de `ui/animation/`. Las
funciones siguen siendo globales, con un `window.dzColabToggle = dzColabToggle`
explícito al final del archivo.

No es descuido: los llaman los manejadores de la interfaz, la tabla de acciones
del menú y los diecisiete recorridos E2E, todos **por nombre**. Cambiar eso a la
vez que se mueve el código serían dos cambios mezclados, y si algo se rompiera no
se sabría cuál de los dos fue. El namespace viene después, con su propia prueba.

Los módulos se cargan **después** de `app.js`: usan `DZ`, `$` y `dzSetStatus` en
tiempo de ejecución, nunca al definirse. Hay un contrato que verifica el orden.

## Los contratos notaron la mudanza

Al mover el código, `check_2d_interaction_contracts.py` falló: buscaba
`dzColabConectar` dentro de `app.js`. Eso es exactamente para lo que está. Ahora
apuntan a donde vive el código, y hay tres contratos nuevos: que los paneles
expongan sus nombres globales, que `index.html` los cargue, y que los cargue
**después** de `app.js`.

## Pruebas

- `tools/check_app_js_budget.py` en la puerta de CI, con el guard verificado.
- 3 contratos estáticos nuevos (131 en total).
- Batería completa: 11 suites de modelo (600 casos), 5 comprobaciones Python,
  **17 recorridos E2E**, los presupuestos de §10 y el humo del empaquetado.

## Lo que sigue de este punto

Quedan 18.050 líneas. Los candidatos gordos y razonablemente separables son el
rigging, la mesa de dibujo y el modal de exportación. La puerta ya está: de acá
en adelante cada trabajo baja el número en vez de subirlo.

## Reversión

Estable previa: `v4.15.1`. La extracción no cambia comportamiento: es el mismo
código en otro archivo, y los recorridos de las dos funciones extraídas lo
verifican.
