# LOW v4.4.0 — Diálogos propios, riel legible y Composición que compone

Esta versión no agrega un subsistema nuevo: arregla cuatro cosas que se veían
todos los días y que hacían parecer prototipo a partes ya construidas.

## Implementado

### Diálogos propios en toda la aplicación

- `confirm()`, `alert()` y `prompt()` del navegador salían en pywebview como
  chrome del sistema operativo, rompían el diseño y —el `confirm()`— congelaban
  el renderer. Se reemplazaron por `dzConfirmModal` / `dzNotice`, con el mismo
  lenguaje visual que el resto de los modales, botón primario enfocado y
  variante `danger` para las acciones destructivas.
- Alcanza a `app.js`, Level Strip, X-sheet y el panel de paletas. En la interfaz
  propia no queda ningún diálogo nativo.
- Los recorridos E2E que antes dependían de que el arnés contestara el diálogo
  del sistema ahora **hacen clic en el modal real**, que es lo que hace una
  persona: el cierre de una pestaña con cambios sin guardar quedó cubierto.

### Modo espejo con su eje a la vista

- El modo espejo duplicaba el trazo reflejado pero no mostraba **dónde** estaba
  el eje: recién al soltar se descubría el centro. Ahora dibuja la línea de
  simetría sobre el lienzo, sobre el mismo eje que usa el reflejo.
- Es UI de pantalla (`dz-penui`): no entra al documento, ni al export, ni a la
  exposición del cuadro. Se redibuja al repintar el lienzo, al cambiar de cuadro
  y al abrir otro documento.

### Riel de herramientas legible

- **P1 corregido:** el reordenado del riel movía cada herramienta primaria al
  *final* de la lista. El riel arrancaba con dos separadores y las herramientas
  vectoriales, y las flechas de selección quedaban al fondo — fuera de la vista
  en cuanto la ventana no era alta. Ahora el orden funcional va primero.
- El riel se abre en columnas cuando no entra en una ventana baja, en vez de
  esconder dos tercios de las herramientas bajo un scroll sin aviso. En ventanas
  altas sigue midiendo lo mismo que antes.
- La prueba de documentos verificaba el orden equivocado (esperaba las primarias
  al final): quedó alineada con el comportamiento correcto.

### Paneles separados

- El panel **Herramientas** separado mostraba una lista de texto: le faltaban
  los iconos del sprite. Ahora viaja el símbolo junto a cada herramienta y la
  ventana auxiliar lo dibuja; si una herramienta nueva no tiene icono, cae al
  texto en vez de quedar como un botón vacío.
- Acoplar un panel lo devolvía **siempre a la derecha**, aunque hubiera salido
  de otro lado: el riel reaparecía del lado contrario de la pantalla. Ahora
  vuelve al muelle que tenía anotado, y lo que nunca estuvo en un muelle se
  limita a reaparecer donde estaba.

### Composición

- **Los efectos de composición eran inalcanzables en su propio workspace:**
  desenfoque, brillo, contraste, saturación y sombra viven en el inspector
  clásico, y la mesa multiplano lo oculta. Ahora están en el inspector de la
  mesa, sobre el plano seleccionado, con Undo y persistencia.
- **Escalonar Z**: acción explícita que reparte los planos en profundidad, del
  fondo al frente, en una sola transacción reversible. Antes todos los planos
  nacían en Z 0, exactamente superpuestos, y la mesa multiplano se veía como una
  sola lámina.
- **Estados explícitos**: una mesa sin planos explica qué es un plano y de dónde
  salen; una mesa con todo en Z 0 avisa por qué se ve chata y ofrece escalonar.
- Los planos sin identidad propia se numeran («Plano 1») en vez de mostrar
  `rect · #ffffff`.

## Pruebas

- Modelo 2D 333/333; multiplano 14/14; colaboración 8/8; storyboard, malla
  (15/15) y schematic (16/16) OK.
- Puentes de guardado e importación, contratos de interacción y compilación
  Python OK.
- Los 9 recorridos E2E de Chromium en verde: rig, IK, coloreo, workspace,
  multiplano, pinceles/importación, storyboard, documentos y Color Studio.
- La puerta de release incorpora las suites de malla y schematic y el recorrido
  de documentos, que existían pero no se ejecutaban en CI.

## Pendiente

- **Smoke del ejecutable empaquetado** sobre Windows: lo hace Mauro sobre el
  instalador publicado, como en `v4.3.0`.
- `check_color_studio_ui.js` pasa localmente pero sigue fuera de CI: correr diez
  recorridos E2E seguidos sobre un único Chromium produce fallos aislados por
  carga del arnés, no por regresión. Entra cuando el arnés levante una instancia
  por recorrido.
- Los efectos por plano viajan con el dibujo; no aceptan claves por cuadro. La
  profundidad y la transformación sí, con Auto-key. El panel lo dice.

## Reversión

La versión estable previa es `v4.3.0`. Para volver: reinstalar su instalador
publicado, o `git checkout v4.3.0` en el árbol. Ningún cambio de esta versión
modifica el formato de `.lowscene`, así que los proyectos guardados con `v4.4.0`
abren en `v4.3.0` sin pérdida.
