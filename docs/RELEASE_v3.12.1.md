# LOW 3.12.1 — Los paneles separados son el panel de verdad, y la línea de tiempo tiene «Otra pantalla»

Reporte de Mauro: «la división de ventanas de herramientas desacopladas todavía no funciona bien, pierde el estilo, y no estoy pudiendo desacoplar la línea de tiempo».

## Por qué perdían el estilo

La ventana separada era **otra página que volvía a dibujar cada panel a mano**, a partir de un resumen del estado. Por más colores que se le copiaran (v3.2), nunca era el mismo panel. Medido en la app:

- **Capas** mostraba nombres internos (`dz-l-1`), glifos sueltos y una barra de opacidad. No tenía Fusión, ni Z, ni los botones de abajo.
- **Color** decía «Elegí un elemento en el lienzo», en vez del muestrario, la opacidad, el grosor y el suavizado.
- **Herramientas** era una grilla, y «Esculpir» aparecía escrito en vez de su icono.
- **Papel cebolla** no entraba en su ventana.

## Ahora

**La ventana separada muestra el panel de verdad:** el mismo HTML, con las mismas hojas de estilo y los mismos iconos. Lo que se hace allá vuelve al estudio como clics, arrastres, campos y teclas sobre el panel real: elegir capa, cambiar de herramienta, hojear la regla, agregar capa, escribir el grosor… Los atajos de teclado también funcionan con la ventana separada al frente.

- Lo que un panel abre al tocarlo, como el cajón «⋯» de herramientas, aparece en la ventana separada, donde hiciste clic.
- Ya no hay una segunda versión de cada panel que mantener: un panel nuevo se separa igual que los demás.
- Vale para Capas, Herramientas, Color, Papel cebolla, Dibujos del nivel, Esqueleto, Línea de tiempo y X-sheet.

## La línea de tiempo se separa desde su pestaña

Antes sólo salía por el menú Ventana. Ahora la pestaña «Línea de tiempo» tiene **«Otra pantalla»**, como los demás paneles. Con la línea de tiempo afuera, el botón pasa a decir **«Traer de vuelta»**, y la pestaña también la trae.

## Arreglado de paso

- **La interfaz podía arrancar sin parte de sus estilos.** En una prueba, seis hojas de estilo seguidas no cargaron al abrir LOW, y la ventana quedó con otro aspecto hasta reabrirla. La causa: el servidor interno de la interfaz atendía como mucho 5 conexiones en espera. Al arrancar, WebView2 pide unos 170 archivos de golpe, y Windows cortaba los que no entraban. En la prueba, 69 de 120 pedidos simultáneos quedaban cortados. Ahora la cola es de 256 y no se corta ninguno.
- **Separar Capas renombraba capas.** Le escribía un id interno (`dz-l-3`) a las capas sin nombre; la capa pasaba a llamarse así y el id quedaba guardado en el archivo. Ya no toca el dibujo.
- **Tamaños iniciales.** La ventana de herramientas abre angosta, del ancho del riel. La de papel cebolla abre más alta.

## Pruebas

- **`check_panel_espejo_ui.js`** (nueva) usa dos pestañas del mismo origen, como en la app, y el ratón de verdad. Con el código anterior falla: la ventana separada seguía siendo el dibujo a mano. Comprueba:
  - **Capas:** las mismas filas y el mismo estilo computado que acoplada, con Fusión; un clic en una fila elige esa capa en el estudio; no se le escriben ids al dibujo.
  - **Herramientas:** el icono real de la flecha; un clic en el pincel lo elige; el riel llena el alto de su ventana. Este último defecto se encontró en la app real: el riel quedaba de 60 px.
  - **Línea de tiempo:** «Otra pantalla» la separa; la ventana tiene la grilla y la regla con la banda del estudio; un clic cambia de cuadro y arrastrar hojea.
  - **Color:** escribir el grosor en la ventana lo cambia en el estudio.
  - **Acoplar:** todo vuelve a su lugar, visible y sin restos.
- **`check_servidor_rafaga_backend.py`** (nueva) manda 120 conexiones simultáneas al servidor de la interfaz. Sin el arreglo, 69 se cortan.
- Probado en la app real con cinco ventanas separadas:
  - herramientas, incluido el cajón «⋯»;
  - capas;
  - la regla de la línea de tiempo;
  - «Acoplar» y «Traer de vuelta».
