# LOW v4.17.0 — Las formas se dibujan arrastrando

## Por qué parecía rota

Elegir una forma la **plantaba sola**, en el centro del lienzo y con un tamaño
fijo. Con la mesa paneada y al 32 % de zoom —como estaba en la captura del
reporte— el centro del lienzo cae **fuera de la pantalla**: uno clickea, no
aparece nada donde tiene los ojos, y la herramienta parece muerta.

No estaba roto el código: estaba mal el comportamiento. En el arnés de pruebas,
con la mesa centrada, `dzAddShape("rect")` creaba el rectángulo perfectamente —
por eso hacía falta mirar el zoom y el paneo de la captura para entender el
reporte.

## Cómo funciona ahora

Como en Illustrator, y como en cualquier programa de dibujo:

> **apretar → arrastrar → soltar**

La forma nace donde apoyás y crece con el gesto. La barra de estado informa la
medida al soltar: *«Rectángulo 604 × 568 · Ctrl+Z la saca de una»*.

| | |
|---|---|
| **Shift** | proporcionado — cuadrado, círculo, línea a 45° |
| **Alt** | desde el **centro** en vez de desde la esquina |
| **clic sin arrastrar** | forma de tamaño cómodo **en ese punto** |
| **Escape** | cancela y no deja nada a medias |
| cambiar de herramienta | también cancela |

El clic simple es lo que arregla el reporte de raíz: aunque no arrastres, la
forma queda **donde clickeaste**, nunca en el centro del lienzo.

El botón de formas ahora **arma la herramienta** con un clic, como cualquier
botón de herramienta. La flecha —o mantenerlo pulsado— abre el menú para cambiar
de forma, que es lo que su propio tooltip decía desde siempre.

## Un solo paso de historial

La forma que crece bajo el dedo es una previsualización: el historial no se toca
hasta soltar. Un rectángulo es un `Ctrl+Z`, no cuarenta.

Escape, el cambio de herramienta y la pérdida del puntero cancelan y borran la
previsualización — es la barrera transaccional que pide §3 de la biblia, la
misma que usan el rig y las herramientas de deformación.

## La regla nueva funcionó el primer día

`ui/panels/shape-tool.js` es un módulo aparte: **lo nuevo no entra en `app.js`**
(§12 AHORA·7, puesto ayer). `dzAddShape` se mudó con él, que es donde pertenece.
Resultado: se agregó una función completa y `app.js` **bajó 42 líneas** —de
18.050 a 18.008—. Es exactamente para lo que se puso la puerta.

De paso salió a la luz un comentario huérfano que describía el comportamiento
viejo —«agregar una forma nueva al centro del lienzo»—, peor que no tener
comentario porque documentaba lo que se acababa de sacar.

## Lo que encontró la prueba y el ojo no

Escribí `DZPointerController.commit(...)` de memoria. **No existe**: la API es
`finish(token, pointerId)`. El síntoma era engañoso — el rectángulo quedaba
dibujado, así que a simple vista «andaba», pero el gesto moría a mitad de camino:
no quedaba seleccionado, no informaba la medida, y el gesto siguiente ya no
arrancaba. Lo encontró el recorrido capturando la excepción.

## Pruebas

- `tools/check_shape_tool_ui.js`, nuevo y en la puerta de CI: las ocho
  conductas, con eventos de puntero reales. Verificado que **falla** con el
  comportamiento viejo — «un clic simple no deja la forma donde se clickeó».
- 6 contratos estáticos nuevos, uno de ellos específicamente contra volver a
  plantar la forma en el centro del lienzo.
- Dos contratos existentes apuntaban a `dzAddShape` dentro de `app.js` y
  fallaron al mudarse. Ahora apuntan a donde vive el código.
- Batería completa: 11 suites de modelo, 5 comprobaciones Python, **18
  recorridos E2E**, presupuestos de §10 y humo del empaquetado.

## Reversión

Estable previa: `v4.16.0`. El texto sigue colocándose con un clic; lo único que
cambia de comportamiento son las formas y la línea.

---

## Nota de v4.17.1 — el arnés esperaba por reloj

La puerta de v4.17.0 falló con `Cannot read properties of null (reading
'image_data')`: `openDesign` corriendo **antes de que el puente exista**.

La causa es de esta misma versión y es mía. Los recorridos esperaban a que
existiera una **función de `app.js`**, que está lista antes que el puente; al
agregar `panels/shape-tool.js` después de `app.js`, la ventana entre «las
funciones existen» y «el puente está listo» se ensanchó, y en un runner cargado
—no en esta máquina— el arranque se metió por el medio.

Corregido en los **dieciocho** recorridos, y de dos maneras según cómo esperaba
cada uno:

- Los que esperaban por condición ahora incluyen `!!api`, que es la condición
  real.
- Cuatro esperaban con un **sleep fijo** de 600 a 2400 ms —la trampa clásica—:
  `check_coloring_ui`, `check_multiplane_ui`, `check_rig_skeleton_ui` y
  `check_brush_vector_import_ui`. Ahora esperan por condición, con tope.

Un sleep fijo alcanza en la máquina de trabajo y se queda corto en el runner: la
prueba falla por lentitud y uno pierde la tarde buscando una regresión que no
existe.
