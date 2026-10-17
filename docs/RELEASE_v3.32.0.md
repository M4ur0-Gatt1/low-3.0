# LOW 3.32.0 — Paisajes en el 3D, pinceles planos y Storyboarder como aliado

Pedidos de Mauro:
- «también quiero poder hacer ríos, lagos, montañas, todos los elementos para componer espacios y paisajes»;
- «quiero pinceles que se vean más planos, más texturas y efectos; pensá que estamos armando un estudio de animación completo»;
- «no quiero usar casi ningún otro programa, sólo Storyboarder, que también quiero que lo recomendemos como aliado».

## Estudio 3D: el paisaje

En el botón **Construir** hay tres herramientas nuevas.

**Terreno (T):** pinceles de relieve sobre un terreno de 240 × 240 m.
- **Levantar** (montañas), **Hundir** (valles), **Suavizar** y **Aplanar**, este último a la altura donde empezás.
- **Radio y Fuerza** se eligen en la barra de abajo. **Shift** invierte: levantar hunde y hundir levanta.
- Un anillo magenta muestra el pincel.

**Río:** marcás el recorrido con clics, de la naciente a la desembocadura.
- Doble clic o Enter lo termina.
- Cava su cauce siguiendo el terreno, y el agua nunca sube río abajo.
- El ancho se elige en la barra.

**Lago:** marcás el contorno con clics.
- Cava la hondonada y la llena con un espejo de agua a la altura de la orilla más baja.

**Además:**
- **El relieve es el piso donde lo hay:**
  - el dibujo sigue la ladera de la montaña;
  - las piezas de la biblioteca (árboles, casas) y las cajas se apoyan en el terreno.
- **Colores** por altura y pendiente: pasto, tierra en los cauces, roca en las laderas y nieve en las cumbres. Salen del kit: con «Boceto en línea» el paisaje es claro, para pasar en limpio.
- **Fondos:** el paisaje sale en los fondos que se mandan al 2D, en un fondo suelto y en las tomas animadas.
- **Ctrl+Z:** cada pincelada, río o lago es un paso.
- **Proyecto:** todo viaja con el .low3d; un paisaje entero pesa unos 170 KB.

Por ahora las calles siguen planas: para un barrio, aplaná el terreno antes de trazarlas.

## Pinceles

**Familia nueva: Planos**
- **Tinta plana:** ancho parejo, la presión no lo cambia.
- **Línea cel.**
- **Marcador plano:** biselado.
- **Pincel plano duro:** para manchar áreas de color.
- **Relleno a mano:** dibujás el contorno y se llena plano, sin línea, como el relleno a lazo.
- **Sombra plana:** relleno con modo **multiplicar**; la sombra toma el color de lo que tiene abajo y no tapa la línea.
- **Luz plana:** relleno con modo **trama**.

**Texturas y efectos nuevos:** témpera, óleo empastado, grafito blando, bolígrafo, lluvia, nieve, salpicado, nubes y pelaje. LOW pasa de 40 a 56 pinceles de fábrica.

**Estudio de pinceles:** cualquier pincel vectorial puede pasar a **Trazo: relleno a mano** y tener **Fusión**: normal, multiplicar, trama, superponer o luz suave.

## Storyboarder, el aliado recomendado

En el panel de storyboard:
- un botón **«¿Storyboarder?»** abre su página;
- la ayuda de **Importar Storyboarder** lo recomienda para dibujar el storyboard y posar monigotes 3D en el Shot Generator, que después se importan.

LOW sólo puede abrir esa dirección: un documento o la IA no pueden usarlo para abrir otras páginas.

## Arreglos

- **El relleno a mano salía vacío.** Un contorno cerrado se simplificaba contra un segmento de largo cero y caía al pincel de cinta.
- **Un trazo empezado en una ladera quedaba despegado del terreno**, en el plano del primer punto, hasta 1,8 m.

## Pruebas

- **`check_3d_terreno_ui.js`** (nueva), con el mouse de verdad. Comprueba:
  - montaña y valle, Ctrl+Z y rehacer;
  - un trazo en la ladera;
  - un pino apoyado en la cima;
  - el río (el agua nunca sube) y el lago (con su hondonada);
  - el proyecto de ida y vuelta, y el pasto y el agua en el fondo de la toma.
- **`check_pinceles_planos_ui.js`** (nueva). Comprueba:
  - **Tinta plana:** con el lápiz de 0,1 a 0,9, el ancho queda en 11,97 → 11,97; con tinta limpia el mismo gesto va de 5,6 a 10,1.
  - **Relleno a mano:** el contorno se llena.
  - **Sombra plana:** sobre rojo deja verde 0 y azul 0 (sin multiplicar, 36 y 55).
  - **Pinceles nuevos:** todos pintan.
- **`check_abrir_web_backend.py`** (nueva): abre sólo la página de Storyboarder.
- **`check_storyboarder_import_ui.js`:** el botón aliado, con clic real.
- **`check_pinceles_ui.js`:** los 56 pinceles se dibujan.
- La puerta completa, en paralelo (31 min): de 201 pruebas, 190 pasan, 9 fallan por carga y pasan solas, y 2 fallan también solas.
  - `check_brush_vector_import_ui` contaba 2 desplegables en el Estudio de pinceles; ahora son 4 por Trazo y Fusión. Se actualizó y pasa.
  - `check_reproduccion_fluida_ui` es la conocida: falla sólo en esta máquina y pasa en GitHub.
