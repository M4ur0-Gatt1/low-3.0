# LOW 3.39.0 — Marionetas para actuar, rotoscopiar y esculpir con precisión

Pedido de Mauro: «está flojo el sistema 3D, y falta que sean monigotes marionetas ya rigueados para posar en las diferentes actuaciones del personaje, y quiero mejores herramientas 3D y más malla para tener más definición; si bien la idea es rotoscopiar, al exigir que el dibujo sea sobre la superficie base tiene que poder modelarse con mucha más precisión».

## La marioneta (Taller de personaje → Posar)

El personaje es una marioneta ya armada: no hace falta mover parte por parte.
- **Manos y pies (anillos):** se arrastran y el brazo o la pierna entera sigue (IK).
  - El codo y la rodilla se acomodan solos y se doblan para el lado del cuerpo.
  - La mano y el pie conservan su orientación: el pie queda plano.
  - Medido: la mano queda a 0,1 mm de donde se suelta.
- **Cadera (cuadrado):** mueve el cuerpo entero con los pies quietos. Para agacharse, sentarse o inclinarse, las piernas se doblan solas.
- Tocando una parte del cuerpo sigue girando desde su articulación, como antes.
- El esqueleto se ve encima.

Cómo se resolvió la IK: el codo y la rodilla son bisagras, y su eje va con el giro del hueso de arriba.
- Primero se rota el húmero o el fémur sobre su largo para que la bisagra quede perpendicular al plano del brazo o la pierna.
- Después el doblez fija la distancia, y un último giro fija la dirección.

Sin eso, el límite anatómico aplastaba el doblez y la mano no llegaba (24 cm de error).

## La actuación (poses clave por cuadro, para rotoscopiar)

- **Clave aquí** guarda la pose en el cuadro elegido; entre clave y clave, cada hueso pasa de una a otra solo.
- Con la primera clave puesta, cada cambio de pose deja clave en el cuadro de ahora.
- Los cuadros de la actuación se fijan a mano o «Como la escena» del 2D.
- Hay un deslizador de cuadro, anterior y siguiente, la lista de claves y **Reproducir** a los cuadros por segundo de la escena.
- **Las 43 animaciones** de la biblioteca de Quaternius (CC0) se ponen en la actuación con su velocidad, desde el cuadro elegido. Quedan como claves, una por cuadro, para retocarlas.
  - Hay de todo: caminar, correr, trotar, saltar, sentarse, levantarse, agacharse, hablar parado y sentado, empujar, levantar algo, bailar, golpes, espada, hechizos, nadar, caer, rodar…
  - Pesan 538 KB en total.
- **Mandar la actuación al 2D:** cada cuadro, desde la cámara del estudio, va a una capa de referencia **«Actuación · Nombre»** con un dibujo por cuadro, listo para rotoscopiar. La calidad es media (más liviana) o completa.
- **En los fondos:** un personaje con actuación colocado en la escena se mueve con la **Toma**. Al recorrer los cuadros o al mandar los fondos al 2D, cada cuadro lleva su pose.

## Esculpir con precisión

- **Definición:** Normal (12 mil triángulos), **Alta ×4 (50 mil)** o **Muy alta ×16 (200 mil)**.
  - La piel se subdivide sin perder la forma: los puntos nuevos van sobre la curva del cuerpo (teselado de Phong), no en el medio recto.
  - La escultura pasa de un nivel al otro.
- **Pinceles nuevos:**
  - **Pellizcar** junta la piel, para afinar bordes.
  - **Surco** marca una línea: arrugas, pliegues de la ropa, labios. Con Ctrl, cresta.
  - Los dos se **autosuavizan**, como en ZBrush o Blender, para que los surcos no salgan arrugados.
- **Precisión:**
  - Tamaño desde 2 mm, y `[` / `]` lo cambian.
  - **Dureza**: borde suave o firme.
  - La **presión de la lapicera** dosifica.
  - **Shift** suaviza y **Ctrl** invierte (inflar ↔ desinflar).
- **Rápido con mucha malla:** tocar la piel pasa por una rejilla de triángulos y las normales se rehacen sólo donde se tocó.
  - Medido con 200 mil triángulos: tocar la piel tarda 0,02 ms y una pasada del pincel 2 ms.
  - Antes, el rayo de three.js tardaba décimas de segundo.
  - Dibujar sobre el cuerpo también usa la rejilla.
- La fuerza está calibrada para el arrastre de verdad, en el que cada punto recibe unos 20 toques. Antes un surco salía como un tajo de 2 cm con escalón.
- La escultura se guarda compacta (`e1:` en base64): con 200 mil triángulos la lista de números no entraba en el almacenamiento.

## Pruebas

- **`check_3d_marioneta_ui.js`** (nueva). Con el mouse y el teclado de verdad comprueba:
  - el anillo de la mano lleva la mano adonde se suelta (0,1 mm) y el codo se dobla;
  - la cadera agacha 25 cm con los pies quietos y las rodillas dobladas;
  - un Ctrl+Z vuelve;
  - la clave en el cuadro 1 y la automática en el 12;
  - que el cuadro 6 queda entre las dos y que Reproducir avanza;
  - «Caminar» deja una clave por cuadro;
  - la definición Alta cuadruplica la malla;
  - un surco con el mouse, con Ctrl+Z, y que `[` achica el pincel;
  - que al guardar y reabrir vuelven la actuación, la definición y la escultura;
  - que en la escena la toma lleva al personaje por su actuación.
- **`check_taller_hoja_2d_ui.js`**: suma la actuación al 2D (33 cuadros de «Caminar», un dibujo distinto por cuadro).
- **`check_3d_taller_personaje_ui.js`**: actualizada a la escultura compacta.
