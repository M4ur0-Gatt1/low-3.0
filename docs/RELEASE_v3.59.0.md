# LOW 3.59.0 · Grupos de capas

Bloque 2 del plan acordado con Mauro para tener en LOW lo que Blender trae para animación 2D: los grupos de capas, que en Grease Pencil 3 son carpetas. Un personaje con 20 capas o más no se puede manejar sin ellos.

## Cómo se usan

- **Clic derecho en el nombre de una capa → «Agrupar esta capa…»:** pide un nombre y arma el grupo.
- **Para sumar otra capa:**
  - clic derecho → «Mover al grupo «…»»;
  - o arrastrar su nombre hasta el encabezado del grupo.
- **Para sacarla:** clic derecho → «Sacar del grupo «…»». Queda justo encima del grupo.
- **El encabezado del grupo, en la línea de tiempo,** tiene:
  - plegar y desplegar;
  - el ojo y el candado del grupo entero;
  - su color y la cantidad de capas;
  - doble clic para renombrar;
  - clic derecho para cambiar el color, sumar la capa activa o desagrupar.
- **Las capas del grupo** llevan una franja de su color.

## Cómo funciona por dentro

- **Un grupo es un bloque contiguo del apilado.** Agrupar junta las capas donde está la de más adelante, en su orden.
- **Ocultar o bloquear el grupo oculta o bloquea sus capas de verdad.** Así lo respeta todo LOW sin excepción: la mesa, la exportación, la reproducción y cada herramienta que mira si una capa está bloqueada (son unas 40).
- **El grupo recuerda cuáles ya estaban ocultas o bloqueadas por su cuenta,** y al mostrarlo o desbloquearlo las deja así. Una capa que entra a un grupo oculto se oculta, y al salir vuelve como estaba.
- **Cada cambio es un paso de Ctrl+Z,** que vuelve el orden, el grupo, la visibilidad y el bloqueo de cada capa. Plegar es de la vista: se guarda en el archivo pero no entra al Ctrl+Z.
- **Se guarda en el `.low`:** `scene.grupos` y `layer.grupo`. Al abrir, una capa que apunta a un grupo que no existe queda suelta, y los grupos vacíos, repetidos o con un id inválido se descartan.

## Arreglo de seguridad

- **El cuadro para escribir un nombre** (renombrar una capa, un grupo, un nivel…) ponía el texto inicial dentro del HTML sin escaparlo.
- **El riesgo:** un `.low` con un nombre que tuviera HTML podía ejecutar código al abrir ese cuadro.
- **El arreglo:** ahora se escapa. El texto se ve igual que siempre, y el código ya no se ejecuta.

## Pruebas

- **`tools/run_grupos_capas_tests.js`** (nueva, en el build): 30 casos.
  - Agrupar junta el bloque en su orden.
  - Ocultar y bloquear respetan lo que ya estaba así, también después de guardar y reabrir.
  - Mover a un grupo y sacar.
  - Plegar no entra al Ctrl+Z.
  - Renombrar, cambiar el color y desagrupar.
  - Cada cambio se deshace y se rehace.
  - Archivos con grupos rotos.
- **`tools/check_grupos_capas_ui.js`** (nueva, en el build): con el mouse de verdad.
  - Agrupar y mover al grupo con el clic derecho.
  - El ojo del grupo saca sus capas del cuadro exportado y deja la de afuera.
  - Plegar y desplegar.
  - Desagrupar, y un Ctrl+Z que lo vuelve a armar.
  - Un nombre con HTML no se ejecuta: con la línea anterior, la prueba falla.
- **Las pruebas de capas que ya existían pasan,** al igual que los contratos de la interfaz: menú de capa, nueva capa, cambiar de capa, capas tipo Harmony, recorte y tono, una sola vista de línea de tiempo y workspace.

## Lo que sigue

**Mover y emparentar una capa entera** (la segunda mitad del bloque 2). Toca cómo se dibuja la capa activa: el lápiz tiene que seguir dibujando bien sobre una capa movida o girada. Va con su propio diseño.
