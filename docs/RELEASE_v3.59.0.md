# LOW 3.59.0 · Grupos de capas y movimiento de capa

Bloque 2 del plan acordado con Mauro para tener en LOW lo que Blender trae para animación 2D:

- **los grupos de capas,** que en Grease Pencil 3 son carpetas: un personaje con 20 capas o más no se puede manejar sin ellos;
- **mover una capa entera con claves y hacer que siga a otra,** que es la base de los fondos que se panean y de los objetos que pasan de mano en mano.

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

## Movimiento de una capa entera

Es la transformación de capa de Grease Pencil, o el peg de Harmony.

- **Clic derecho en la capa → «Movimiento de la capa…».** Posición, giro y escala en el cuadro actual, «Clave en el cuadro N», quitar una clave, el pivote («Centro» = el centro de la hoja) y **«Sigue a»**, la capa padre.
- **Entre clave y clave el movimiento es parejo.** Antes de la primera y después de la última, se sostiene.
- **Una capa que sigue a otra hereda su movimiento** y le suma el suyo: el vaso sigue a la mano, la mano se anima sola. Un círculo de padres (A sigue a B, que sigue a A) se rechaza, y si viniera en un archivo no cuelga la app.
- **El dibujo no se toca.** El movimiento se aplica al mostrar las otras capas en la mesa, al reproducir y al exportar.
- **La capa que estás dibujando se ve en su lugar propio, sin el movimiento,** y la mesa la marca con un borde punteado y un aviso.
  - **Por qué:** las herramientas convierten la posición del lápiz con la hoja en 56 lugares distintos. Mostrar movida la capa que se edita las haría dibujar corrido (la prueba lo confirma rompiéndolo a propósito).
  - **Al reproducir,** la capa activa también se ve movida.
- **Cada cambio es un paso de Ctrl+Z.**
- **Se guarda en `layer.mov`** (claves, pivote y padre), con normalizador.
- **Las capas sin movimiento,** es decir todos los proyectos existentes, se ven y se exportan igual que antes.

**Lo que todavía no hace:**
- **Pegar una capa a un hueso del rig:** por ahora el padre es otra capa.
- **La curva entre claves:** por ahora es lineal.
- **Una capa recortada con una base que se mueve distinto:** la máscara no acompaña ese movimiento.

### Pruebas del movimiento

- **`tools/run_movimiento_capa_tests.js`** (nueva, en el build): 30 casos.
  - Interpolación y sostenido.
  - Giro alrededor del pivote.
  - Cadena de padres y círculos rechazados o tolerados.
  - Ctrl+Z y la ida y vuelta por archivo.
  - Duplicar copia el movimiento.
- **`tools/check_movimiento_capa_ui.js`** (nueva, en el build): con el mouse de verdad.
  - Clic derecho, poner la clave y la mesa con el fondo corrido 200.
  - El dibujo intacto y el export movido.
  - El vaso que sigue al fondo.
  - La capa activa marcada, y un trazo que cae a 2 px de donde se apoya el lápiz.
  - Reproduciendo se ve movida, y al parar no.
  - Ctrl+Z por cada cambio.
  - Se rompió a propósito el movimiento en la mesa y la capa activa siempre movida, y las dos roturas se detectan.

## Lo que sigue

1. **Pegar una capa a un hueso, y curvas entre claves.**
2. **El desfase de tiempo por capa.**
3. **Bloque 3, modificadores de capa:** temblor de línea, el trazo que se dibuja solo, contorno y punteado.
