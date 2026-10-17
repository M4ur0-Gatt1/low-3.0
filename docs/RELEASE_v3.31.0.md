# LOW 3.31.0 — El estudio 3D como un SimCity: calles, biblioteca de piezas y kits de estilo

Pedidos de Mauro:
- «estábamos haciendo que el módulo 3D sea como un SimCity para construir una ciudad para el escenario»;
- «las cosas se deben construir con bibliotecas que se puedan personalizar o hacer de cero, porque cada paisaje puede tener estilos distintos».

## Construir: un solo botón con su lista

Las herramientas para armar el escenario están en un botón **Construir** de la barra izquierda, con su lista, como los grupos de Toon Boom. La lista se abre con la flechita o con clic derecho, y tiene:
- **Caja** (X);
- **Calles** (R);
- **Piezas** (N).

El botón muestra la herramienta en uso. Así la barra no se llena con cada herramienta nueva.

## Calles (el pavimentador)

- **Marcar:** clic a clic sobre el piso marca el recorrido. Doble clic o Enter la termina, Backspace saca el último punto y Esc la cancela. Shift hace tramos a 15°.
- **Anchos:** **Pasaje** (4 m de calzada), **Calle** (7,5 m) o **Avenida** (14 m, doble línea).
- **La calle sale entera:** calzada, cordones, veredas y línea del medio. En los cruces lleva sendas peatonales y los cordones cortados.
- **Pegado:** un clic cerca de otra calle se pega a ella. En su punta la continúa; en su eje hace una T.

## Biblioteca de piezas

**Construir → Piezas** abre la **Biblioteca** a la derecha, con una miniatura de cada pieza.

**Colocar:**
- **Clic** coloca la pieza elegida en el piso o sobre la tapa de una caja. Antes de hacer clic, una caja magenta muestra dónde va a caer.
- **Arrastrar siembra** copias separadas: árboles, rocas, faroles. Cada copia varía un poco de tamaño y de giro, según la pieza. **Shift:** sin variar.
- Todo lo de un gesto es **un** Ctrl+Z.

**Lo colocado** queda como objetos comunes del proyecto, agrupados con el nombre de la pieza: se mueven, se borran y se guardan con el .low3d.

**Kits de fábrica:**
- **Color plano:** volúmenes de colores lisos con aristas. Trae casa, casa de dos plantas, edificio, torre, galpón, árbol, pino, arbusto, farol y roca.
- **Boceto en línea:** las mismas formas como líneas, para layouts a lápiz.

**Personalizar:**
- **Duplicar kit** hace una copia tuya: cambiás piezas, variación (tamaño mínimo y máximo, giro, separación) y los colores de las calles.
- **Kit vacío** es para empezar de cero.
- **Guardar lo elegido como pieza** convierte cualquier cosa armada en el estudio (cajas, trazos, rellenos, volúmenes) en una pieza que después se coloca con un clic. Si el kit elegido es de fábrica, se crea tu copia con la pieza nueva.
- **Exportar… / Importar…** pasan un kit (.lowkit) entre proyectos y computadoras.
- **El estilo del kit** también pinta las calles: con «Boceto en línea» la calzada sale clara y la tinta negra.

## Arreglos

- **El doble clic no terminaba la calle.** En Chrome y en WebView2, un toque del puntero siempre informa 0 clics. Ahora el doble clic se reconoce por tiempo y distancia.
- **«Nuevo proyecto» heredaba la cámara del proyecto anterior,** la del autoguardado. Si había quedado mirando al cielo, en el proyecto nuevo no había piso donde dibujar. Ahora arranca con la vista de inicio.

## También entra

Tres cambios del 3D que estaban subidos sin publicar:
- la fuga se ve sin prender nada, con «Encuadrar lo dibujado» y la guía de 4 pasos;
- el piso no tiene fin y el centro de trabajo se marca en magenta;
- la caja cava un hueco si se la arrastra hacia abajo.

## Pruebas

- **`check_3d_calles_ui.js`** (nueva), con el mouse de verdad:
  - la flechita de Construir → Calles, y la tecla R;
  - una calle de 7,5 + 2 × 2,5 m en el piso;
  - Esc y Backspace;
  - Ctrl+Z y rehacer;
  - un cruce que rearma la primera calle (de 13 a 28 piezas);
  - continuar desde la punta;
  - la avenida de 14 + 2 × 3,5 m;
  - las calles viajan con el proyecto y vuelven con sus cruces.
- **`check_3d_biblioteca_ui.js`** (nueva):
  - la biblioteca con 10 piezas y sus miniaturas;
  - un árbol con un clic, en el piso y donde se hizo clic;
  - sembrar arrastrando seis copias separadas y de tamaños distintos, que un solo Ctrl+Z saca;
  - Shift sin variar;
  - una pieza propia que crea tu copia del kit, se guarda y se coloca igual que el original;
  - el kit de línea cambia el estilo de las calles;
  - todo viaja con el proyecto.
- **`check_3d_proyecto_ui.js`:** un proyecto nuevo arranca con la cámara de inicio y se puede dibujar en el piso. Fallaba antes del arreglo.
- Pasan todas las del estudio 3D.
- La puerta completa en esta máquina: pasan 194 y fallan 4.
  - `check_export_destino_backend.py` y `check_marco_seleccion_ui.js`: el primero fue un error del script de la puerta y el segundo, la carga de la máquina. Las dos pasan solas.
  - `check_encuadre_alineado_ui.js` (18 px de desfase después de cambiar la ventana) y `check_reproduccion_fluida_ui.js` (36 de 48 cuadros en 2 s): fallan igual con la 3.30.0 en esta máquina, cuya compilación en GitHub pasó. Quedan anotadas para revisar si fallan en GitHub.
