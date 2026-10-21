# LOW 3.40.0 — Cuerpos variados, cara que actúa y posado de stop motion

Pedidos de Mauro:
- «está un poco tosca y le falta movimiento de hombros, omóplato, clavicular»;
- «quiero modelos más variados, no sólo este físico culturista, quiero flacos, gordos»;
- «quiero poder cambiar ojos, boca, abrir, cerrar»;
- «el movimiento de la cabeza está pésimo: pensá en poses más suaves, movimientos más parecidos a un rigging de stop motion, tiene que tener más control de movimientos sutiles»;
- «¡la cabeza nunca puede estar ahí!»;
- «quiero elegir el diámetro de las formas con un dial»;
- «manejadores para manos, tamaños de manos y pies».

## Posar como un armazón de stop motion (Taller de personaje → Posar)

- **El giro es proporcional al arrastre**, como girar una rótula con la mano: 0,45° por píxel.
  - **Shift:** 0,1° por píxel, para los movimientos sutiles.
  - **Alt:** gira la parte sobre su largo (la cabeza mira al costado, el brazo rota).
  - **Flechas:** con una parte elegida, la giran de a 2° (Shift: 0,5°). Cada toque es un paso de Ctrl+Z y deja clave si hay actuación.
  - Antes la parte «apuntaba» al cursor. Con palancas cortas como la cabeza, eso daba saltos enormes.
- **La cabeza se reparte entre el cuello y el cráneo** (45/55), como un cuello de verdad, en vez de quebrarse desde la base del cráneo.
- **Topes anatómicos de un cuello real:**
  - agachar 50° (mentón al pecho), levantar la cara 55°, girar 76°, inclinar 34°;
  - agachar e inclinar a la vez se topan en elipse. Con dos topes sueltos se sumaban en la diagonal y la cabeza caía sobre el hombro;
  - un arrastre largo se aplica de a 10°, topando en cada paso. Medido: de un saque, arrastrar la cabeza hacia abajo la terminaba girando al costado.
- **Hombros:** cada clavícula tiene su **rombo** para subir, bajar, adelantar o atrasar el hombro.
  - Con **Hombros automáticos** (prendido de entrada), al levantar el brazo por encima del hombro la clavícula sube sola, hasta 28°.
  - **El brazo tiene topes:** sube hasta vertical (la clavícula pone el resto), baja hasta el costado, cruza el pecho hacia adelante y va poco hacia atrás. Antes pasaba por encima de la cabeza al otro lado.
  - La IK del anillo de la mano conserva su libertad para llegar adonde se suelta.
- **Ajuste fino:** cada parte elegida muestra sus diales en grados (asentir, mirar al costado, ladear; doblar y rotar en codos y rodillas…).

## Manos y pies

- **Manos:** por mano, Abierta, Relajada, Agarrar, Puño y Señalar. Además, diales para cerrar los dedos, el índice y el pulgar.
  - El puño sale de la biblioteca de animaciones: cada falange va del reposo a ese puño.
- **Tamaño de manos y de pies:** dos diales nuevos en «Cuerpo y proporciones».

## Cuerpos variados

- **Contextura:** Musculoso, Atlético, Normal, Flaco, Rellenito, Gordo y Muy gordo, más los diales de **Peso** (flaco ↔ gordo) y **Músculo** (blando ↔ marcado).
  - Engorda o adelgaza por región: la panza sale para adelante y la papada crece.
  - Lo blando borra el marcado de los músculos.
  - La cara no se infla. Los ojos, las cejas y las pestañas son mallas aparte: la piel los tapaba.
  - Los dos labios se mueven juntos, sin serrucho.
- **Grosor por parte, con un dial:** cabeza, cuello, torso, brazo, antebrazo, muslo y pierna.
  - Es el diámetro de cada forma. Se suma al alto automático de las proporciones.
- En el maniquí, de piezas rígidas, sólo se usa el grosor (engordarlo lo desarmaba).

## La cara

- **Expresiones:** Neutral, Sonrisa, Risa, Sorpresa, Enojo, Tristeza, Miedo, Dormido y Guiño.
- **Visemas para hablar:** A, E, I, O, U, M y F, una clave por sílaba.
- **Diales:**
  - párpados, mirada (izquierda/derecha, arriba/abajo);
  - boca (abrir), comisuras (triste ↔ sonrisa), ancho (fruncida ↔ estirada);
  - cejas y fruncir el ceño.
- Las expresiones entran en la actuación: cada clave guarda su cara y entre claves pasa de una a otra con entrada y salida suaves.

Cómo funciona:
- **La boca se abre de verdad.** Los labios de estos cuerpos estaban cosidos en una fila de puntos: se separan, y el de abajo va con la mandíbula.
  - La línea de corte sigue el borde real de los labios.
  - Cada punto toma el lado de los triángulos que lo usan.
  - El fondo de la boca y las comisuras se estiran en degradé.
  - El interior se pinta oscuro.
  - Medido: abierta, ningún borde de la piel se estira más de 6 mm. Antes había «colmillos» de 3 cm.
- **Los párpados** giran sobre el globo del ojo y cierran por afuera de él. Se apagan antes de la ceja.
- **Las pestañas** bajan con el párpado y **las cejas** siguen a su piel.
  - Venían en la misma malla, en piezas sueltas: se separan por altura.
  - Antes, al cerrar los ojos, la ceja se arrastraba y aparecían «granos» sobre la frente.
- **Los ojos miran:** el globo gira sobre su centro.

## Pruebas

- Nueva: `tools/check_3d_cara_cuerpo_ui.js`, con el mouse y el teclado de verdad:
  - la boca se abre sin colmillos y Ctrl+Z la cierra;
  - «Dormido» cierra los ojos sin mover las cejas;
  - el dial de la boca funciona con las flechas;
  - Puño, Abierta y Señalar se aplican a la mano elegida sola;
  - la cabeza arrastrada 700 px para cada lado nunca sale de los topes, y para abajo asiente sin girarse;
  - Shift gira más fino y las flechas giran de a 2°;
  - el brazo llega a vertical con el hombro subiendo y no cruza sobre la cabeza;
  - Gordo y Flaco cambian la panza y Ctrl+Z vuelve;
  - los diales de grosor y de tamaño de mano funcionan.
- `check_3d_taller_personaje_ui`: el codo ahora sube en proporción al arrastre: unos 25° con 110 px.
