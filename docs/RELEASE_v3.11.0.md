# LOW 3.11.0 — Capas de mapa de bits, como en OpenToonz y Toon Boom

Pedido de Mauro, por el reclamo de un usuario: «no sé si tenemos la opción de dibujar en bits como tienen OpenToonz o Toon Boom; quiero separar eso tal cual lo hacen esos programas».

## El tipo es de la capa

En OpenToonz el **nivel** es vectorial o de mapa de bits; en Harmony lo es la **capa**. El tipo decide qué hacen el pincel, la goma y el balde. LOW ya guardaba un tipo en cada nivel, pero nadie lo usaba. Ahora cada capa es **vectorial**, como hasta ahora, o **de mapa de bits**.

### Crear una capa de mapa de bits

- **▦**, al lado de **«+ Capa»**, en la línea de tiempo;
- **Capa → Nueva capa de mapa de bits.**

La fila de la capa lleva **▦** y una marca celeste. Mientras trabajás en ella, la barra de la herramienta dice **«Mapa de bits»**.

## Cómo se dibuja en una capa de mapa de bits

- **Cada dibujo es una hoja de píxeles:** una imagen PNG, sin pérdida, del tamaño de la página, con 1,5 píxeles por unidad. Una 1920×1080 se pinta en 2880×1620.
- **Todo lo que dibujás se vuelve píxeles** al terminar el trazo: cualquier pincel de LOW (tintas, lápices, acuarela, carbonilla, los de las bibliotecas…), el lápiz, las formas y el texto.
- **La goma borra píxeles, en vivo.** No borra el dibujo entero como en una capa vectorial. Tiene su propio **tamaño** en la barra y, con lápiz, la presión achica la goma.
- **El balde rellena píxeles:** inunda la zona del clic con el color de relleno y una **tolerancia** que se ajusta en la barra. Rellena **por debajo** de la línea y cubre su borde suavizado, así no queda halo.
- **Un paso de Ctrl+Z por trazo**, borrado o relleno.
- **La hoja no se puede seleccionar ni borrar entera.**

El contenido sigue siendo un dibujo de LOW con una imagen adentro, así que el **papel cebolla**, la **planilla**, las **miniaturas** y la **exportación** funcionan igual que con las capas vectoriales. El tipo de cada capa **se guarda con la escena**.

## Encontrado en el camino

En la primera versión, lo pintado se perdía. Las otras capas y el papel cebolla se dibujan dentro de la misma hoja como **copias de sus planos de arte**, y la hoja de píxeles fue a parar adentro de la copia de la Capa 1. Ahora la capa sólo usa los planos propios del dibujo, y la prueba exige que la otra capa no se toque.

## Pendiente

- **Selección y transformación de píxeles:** lazo y marco que muevan o escalen una zona de la hoja.
- **Convertir** una capa vectorial existente a mapa de bits.
- **El círculo de la goma** muestra el grosor del trazo y no el de la goma.

## Pruebas

**`check_capa_bitmap_ui.js`** (nueva) usa el mouse de verdad. Comprueba que:

- en una capa vectorial el pincel sigue dejando vectores;
- **▦** crea una capa de mapa de bits, con la fila marcada y la barra que lo dice;
- un círculo de pincel se vuelve una sola imagen, sin vectores, en un solo paso, guardada en el documento, y la otra capa no se toca;
- la goma borra píxeles sin borrar la imagen, en un solo paso, y Ctrl+Z los vuelve;
- el balde rellena adentro del círculo con el color de relleno, sin tapar la línea y sin escaparse;
- el tipo se guarda con la escena;
- Capa → Nueva capa de mapa de bits también la crea.

Probada también en la app real (WebView2): pintar dos trazos, borrar el cruce y ver el historial (un paso «Pintar» por acción).
