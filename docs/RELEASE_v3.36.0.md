# LOW 3.36.0 — La cámara 2D con método (inicio → final → ▶) y su tutorial

Pedido de Mauro: «no entiendo bien cómo se maneja el movimiento de cámara; mejorá esa interfaz y metodología y hacé un tutorial también».

## Lo que se midió

Seis cosas hacían que la cámara no se entendiera:

1. **Una sola clave no mueve nada.** Ir al cuadro 24 y mover el marco, que es lo natural, dejaba una clave sola y una toma quieta, sin aviso.
2. **El panel Cámara no aparecía.** Vivía en el inspector, y en los espacios Animación y Dibujo el inspector no se ve. El modo cámara se prendía sin pasos, sin claves y sin curva.
3. **El play no mostraba la toma.** Mostraba la hoja entera, mientras la exportación salía por la cámara.
4. **La escena duraba menos que la cámara.** Una escena nueva dura un cuadro: la cámara iba del 1 al 24 y el play no tenía qué reproducir.
5. **El rótulo mentía.** Decía «interpolada» aunque no hubiera ninguna clave. Además, la esquina del zoom no decía hacia dónde acerca, y en la ayuda faltaba el ícono de girar.
6. **No había forma de mudar una clave de cuadro ni de saltar entre claves,** y los Movimientos borraban claves del medio sin avisar.

## El método: inicio → final → ▶

Arriba del panel Cámara hay un **paso a paso**:

1. **Encuadre de inicio** en el cuadro N → **Ir y encuadrar**: va al cuadro y deja la clave. Ahí se arrastra el marco.
2. **Encuadre final** en el cuadro M → **Ir y encuadrar**: va al cuadro y deja la clave. Ahí se mueve el marco a donde termina la toma.
3. **Mirá el movimiento** → **▶ Ver**.

Cada paso hecho muestra un ✓, y el paso del cuadro donde estás se resalta.

Debajo, una **pista** dice qué falta en palabras, por ejemplo:
- «Falta el encuadre final: con una sola clave la cámara no se mueve».
- «Las claves tienen el mismo encuadre».
- «La escena dura 1 cuadro y la cámara sigue hasta el 24», con el botón **Alargar la escena hasta la última clave**.

## Los arreglos

- **La clave de partida.** Si no hay ninguna clave y se mueve la cámara en un cuadro posterior, también queda la clave del primer cuadro con la hoja entera. El movimiento existe, y la barra de estado lo explica.
- **El panel siempre a la vista.** Si el inspector no está, el panel Cámara flota contra el borde derecho, sin tapar la hoja ni el marco, y se arrastra por su cabecera.
- **El play sale por la cámara.** Cada cuadro se renderiza como en la exportación, con la profundidad de la multiplano, y se muestra dentro del marco, girado como él; lo de afuera se oscurece y el marco acompaña a la toma.
  - Se apaga con **Play por la cámara**.
  - Con «Ver por la cámara» no se aplica, porque ahí ya es la vista la que sigue a la cámara.
- **La escena dura lo que dura el movimiento.** Con un fondo quieto (un cuadro), «Encuadre final» alarga la escena hasta ese cuadro: cada capa sostiene su último dibujo. Es un solo Ctrl+Z. Con una escena ya animada no se toca sola: lo ofrece la pista.
- **El rótulo dice la verdad.** Puede decir:
  - «CLAVE»;
  - «entre F001 y F024»;
  - «quieta hasta / desde…»;
  - «sin claves: la hoja entera».

  Mientras se arrastra muestra el zoom en % y el giro. La cabecera del panel dice lo mismo.
- **Mudar claves y saltar entre ellas.**
  - En la lista, el número de cada clave se edita: escribís otro cuadro y la clave se muda. Un clic en el número también lleva a esa clave.
  - **◀ Clave / Clave ▶** saltan entre claves.
- **Los Movimientos de un clic avisan** cuántas claves del medio reemplazaron.
- **La ayuda dice qué hace cada manija:** la esquina, hacia adentro, acerca y hacia afuera aleja; el círculo de arriba gira.

## El tutorial

**Ayuda → Tutorial: mover la cámara**, el **?** del panel Cámara, o la oferta que el panel muestra la primera vez.

Es una tarjeta que pide un paso por vez y **avanza sola cuando lo hacés de verdad**:

1. El modo cámara.
2. Un encuadre de inicio distinto de la hoja entera.
3. Un encuadre final distinto del de inicio.
4. El recorrido y la curva (con «Siguiente»).
5. El play.
6. Listo, con los extras.

En cada paso, **Hacelo por mí** lo hace. La tarjeta se arrastra por la cabecera.

También hay un tutorial escrito: `docs/CAMARA_2D_TUTORIAL.md`.

## Pruebas

- **`check_camara_metodo_ui.js`** (nueva). Con el mouse de verdad, comprueba:
  - sin claves, el rótulo dice «sin claves»;
  - arrastrar en el 12 deja claves en 1 (la hoja entera) y 12, y en el 6 el rótulo dice «entre F001 y F012»;
  - la esquina muestra el zoom en % mientras se arrastra;
  - «Encuadre final» en el 24 va al 24, deja su clave y alarga la escena;
  - editar el número muda la clave del 24 al 30;
  - ◀ y ▶ saltan entre claves;
  - el play sale por la cámara (24 cuadros, ninguno sin cámara) y la imagen queda dentro del marco;
  - el tutorial se recorre haciendo cada paso hasta «Listo».

  Falla en la 3.35.0.
- **`check_camara_2d_ui.js`:** sigue pasando. El clic en «F013» de la lista lleva a esa clave.
