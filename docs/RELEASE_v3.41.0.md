# LOW 3.41.0 — Modelar como en ZBrush y Blender, cuerpos con huesos de verdad

Pedidos de Mauro:
- «copiá los mejores programas de modelado 3D para esta sección», «que el sistema sea lo mejor de lo mejor», «acordate que sólo se puede dibujar sobre la superficie creada»;
- «los cuerpos no se comportan como si tuvieran huesos, quisiera un comportamiento más anatómico humanoide»;
- «en la versión anterior se hacía la animación de una caminata automática sola en el panel del personaje, pero ahora no logro hacerlo».

Se copió **cómo trabajan** ZBrush, Blender (modo Escultura) y Nomad Sculpt, y sus atajos. El código es propio.

## Huesos de verdad

Medido antes del cambio, los cuerpos se portaban como goma:
- el codo doblado 140° se desinflaba;
- el antebrazo girado se estrangulaba como un caramelo;
- la rodilla quedaba en punta;
- al levantar la pierna, la cadera se volvía una masa.

Ahora:
- **Skinning de cuaterniones duales** (el de los rigs profesionales), en la GPU y también en la CPU, para que el pincel y el rayo toquen donde se ve. La piel gira alrededor de la articulación y conserva su volumen.
  - Medido: girar el antebrazo y levantar la pierna perdían el 9 % del volumen del miembro; ahora lo conservan.
- **Huesos de giro en el antebrazo** (los «twist bones»): al girar la mano, el giro se reparte a lo largo del antebrazo, como el radio que rueda sobre el cúbito. Ya no se estrangula en el codo.
- **Topes anatómicos** que faltaban:
  - cadera: adelante 125°, atrás 30°, abrir 50°, cruzar 30°, rotar 40°;
  - muñeca: doblar 80°, levantar 70°, al meñique 35°, al pulgar 20°, casi sin girar, porque la mano gira con el antebrazo;
  - tobillo: abajo 50°, arriba 25°;
  - clavícula.
  - Se aplican al girar a mano (arrastre, flechas, diales). La IK de los anillos sigue libre para llegar adonde se suelta.
- **Los diales del lado derecho, espejados.** Antes «abrir» la pierna derecha la cruzaba. Ahora «abrir» abre las dos hacia su lado; lo mismo en brazos, muñecas, tobillos y hombros.

## La pestaña «Animar»

- La actuación tiene su propia pestaña, junto a Dibujar, Posar y Esculpir.
  - En la 3.40 había quedado enterrada al final de «Posar», debajo de las manos y la cara.
- Arriba están las **animaciones listas** (caminar, correr, saltar, sentarse, bailar…, las 43 de Quaternius).
- **«Poner desde el cuadro… y reproducir»** las pone y arranca: la caminata se ve sola.
- El cuerpo se agarra como en Posar y cada pose queda como clave.

## Esculpir: los pinceles de los grandes

Cada pincel tiene la tecla de Blender:

| Pincel | Tecla | Qué hace | Ctrl |
|---|---|---|---|
| Dibujar | X | Levanta la piel por el plano del pincel | Hunde |
| Arcilla | C | Tiras planas con la punta cuadrada a lo largo del trazo: construye volumen por capas (Clay Strips) | Saca |
| Capa | L | Sube a una altura pareja; ir y volver en el mismo trazo no acumula (Layer) | Hunde |
| Inflar | I | Empuja la piel hacia afuera | Desinfla |
| Surco | Shift+C | Hunde una línea fina (DamStandard) | Cresta |
| Pellizcar | P | Junta la piel hacia el centro | — |
| Suavizar | S | Empareja la piel; con cualquier pincel, Shift | — |
| Aplanar | Shift+T | Lleva la piel a un plano | — |
| Raspar | R | Baja lo que sobresale (Scrape) | Rellena lo hundido (Fill) |
| Mover | G | Agarra un pedazo y lo lleva con el cursor | — |
| Gancho | K | Estira la piel siguiendo el cursor: cuernos, orejas en punta, mechones (Snake Hook) | — |
| Empujar | N | Corre la piel por la superficie hacia donde va el trazo (Nudge) | — |
| Máscara | M | Protege lo pintado | Borra (Shift: suaviza el borde) |

**El trazo:**
- **Espaciado:** un toque cada tanto, interpolado por el camino. Antes, con un movimiento rápido del mouse quedaban huecos; ahora el trazo sale parejo.
- **Estabilizador:** la punta va detrás del cursor, atada con una cuerda, para trazos firmes con el pulso tembloroso (el Lazy Mouse de ZBrush).
- **Curvas de caída:** Suave, Esfera, Punta, Lineal y Meseta, además de la dureza.
- **Sólo caras de frente** (prendido de entrada): el pincel no atraviesa lo fino (orejas, dedos, labios). Medido en la mano: atraviesa 4 veces menos.
- **Presión = tamaño**, para la lapicera.
- **F** cambia el tamaño moviendo el mouse y **Shift+F** la fuerza. Clic o Enter: listo; Esc: como estaba.
- **[ ]** cambia el tamaño y **{ }** la fuerza.
- Las letras funcionan aunque el foco haya quedado en un deslizador del panel. Antes, tocar el tamaño y apretar X no hacía nada.

## La máscara

- Lo enmascarado se ve oscuro y ningún pincel lo mueve.
- **Enmascarar una parte de un clic** (cabeza, cuello, torso, cadera, brazos, antebrazos, manos, muslos, piernas, pies), con Sólo esa, Sumar y Quitar.
- Invertir (Ctrl+I), Crecer, Achicar, Suavizar, Afilar y Borrar (Alt+M).
- Cada cambio es un paso de Ctrl+Z.

## Piezas: ropa, pelo, accesorios

La máscara también marca dónde va una pieza: «Levantar la pieza de la máscara» crea una cáscara con grosor (el Extract de ZBrush). Así, sobre el cuerpo y sobre la superficie que se modela, se arman remeras, pantalones, pelo, botas y armaduras.

- **El borde corta los triángulos justo donde la máscara vale la mitad**, como una curva de nivel: escotes y sisas limpios, sin la escalera de triángulos.
- **La tela se alisa sin encoger** (Taubin), según el suavizado: de calcar la piel a una tela lisa que no marca los músculos. Nunca se mete en la piel.
- **Se rehace desde la piel:** si se esculpe, se engorda o cambia la cara, la pieza acompaña.
- Va con los **mismos huesos** que el cuerpo y sigue cualquier pose y animación.
- **Se dibuja encima:** el trazo se pega a la parte del cuerpo de abajo.
- Grosor de 0,5 a 40 mm, suavizado, color, nombre, ver u ocultar y borrar.
- Pasa entre definiciones. Una malla de cuerpo entero a «Muy alta» pesa 67 KB.

## Capas de escultura (como Nomad)

- Lo que se esculpe va a la capa elegida, y su dial (de −1 a 2) lo sube o lo baja: unas arrugas, una panza, una variante.
- **Fijar** pasa la capa a la principal; **✕** la borra.

## Filtros (toda la piel de una)

Suavizar, Inflar, Desinflar y Afilar, sobre todo lo que no esté enmascarado (el Mesh Filter de Blender).

## Pruebas

- Nueva: `tools/check_3d_modelado_ui.js`, con el mouse y el teclado de verdad: atajos, espaciado, capa contra dibujar, máscara, caras de frente, F, estabilizador, gancho, la remera completa (grosor, dibujar encima, sigue la pose, definición, Ctrl+Z), capas y filtros.
  - Mide además el volumen en codo, antebrazo girado, rodilla y cadera, y que «abrir» abre las dos piernas hacia su lado.
- `check_3d_marioneta_ui` y `check_taller_hoja_2d_ui` usan la pestaña «Animar». La caminata se reproduce al ponerla.
