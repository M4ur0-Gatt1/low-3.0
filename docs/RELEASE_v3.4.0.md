# LOW 3.4.0: pinceles de textura y de efectos, y mejor sensibilidad de la tableta

## 40 pinceles, ordenados por categoría

El selector de pincel y el Estudio de pinceles se ordenan en **Lápices, Tintas, Pintura, Texturas, Efectos y Borradores**. Los pinceles nuevos son estos:

- **Lápices**:
  - **Lápiz grafito**, con grano de grafito y punta fina al empezar y al terminar.
  - **Lápiz de color**.
  - **Crayón de cera**.
- **Tintas**:
  - **Tinta con remate**: arranca y termina en punta, también con el mouse.
  - **Tinta seca**.
  - **Tinta de cómic**, que ahora también remata.
- **Pintura**:
  - **Acuarela de borde**: lavada en el centro, con el pigmento acumulado en el borde y el borde ondulado.
  - **Óleo sobre lienzo**.
  - **Esponja**.
- **Texturas**:
  - **Grano de papel**.
  - **Puntillismo**.
  - Carboncillo, Tiza, Pastel y Spray, ahora con grano de verdad.
- **Efectos**:
  - **Neón**: halo de color con núcleo blanco.
  - **Brillo suave**.
  - **Destellos**.
  - **Confeti**, que cambia de color en cada sello.
  - **Pasto**.
  - **Hojas**.
  - **Humo**.
  - **Rayado**, para sombreado de líneas.

## Las texturas son de verdad

Antes, la textura de los pinceles vectoriales no hacía nada: el Lápiz de animación decía «grafito» y salía liso. En los pinceles raster, la «textura» solo cambiaba el tamaño de los sellos.

Ahora cada textura es un filtro que viaja dentro del dibujo, así que se ve igual en la mesa y en el export. **El grano queda fijo en la hoja**, como el de un papel: dos trazos que se cruzan comparten el grano.

Las texturas disponibles son grafito, carbón, tiza, pastel, crayón, papel, lienzo, seco, spray, gouache, áspero, acuarela y húmedo. **La paleta sigue recoloreando** los trazos con textura.

## El Estudio de pinceles

- **Miniaturas**: cada pincel de la lista muestra un trazo de verdad, y la vista previa usa el mismo dibujo que la mesa.
- **Textura y efecto**: elegís la textura, su fuerza y su escala, el brillo y el remate al empezar y al terminar.
- **Sellos** (pinceles raster):
  - **forma**: redonda, punto, destello, pasto, hoja, confeti o rayita;
  - **variación** de tamaño, de ángulo, de color y de opacidad.

## Sensibilidad de la tableta

Medido en la app real:

- **Con el mouse el ancho temblaba.** Cada muestra llega por dos caminos, y uno leía la presión «cruda» (0,5 en un mouse) mientras el otro daba 1, así que la presión del trazo saltaba entre 0,52 y 1. Ahora con el mouse es pareja.
- **Con el lápiz calibrado, la presión zigzagueaba.** Uno de los dos caminos salteaba la calibración de inicio y máximo, así que cada muestra entraba una vez calibrada y otra cruda. Ahora las dos copias traen la presión calibrada.
- **El suavizado de la presión dependía de la tableta**: era un promedio de 5 muestras, que en una tableta rápida son 25 ms y en una lenta 83 ms. Ahora es por tiempo (12 ms), igual en cualquier tableta.
- **Probar con la tableta**, en Preferencias: hacés un trazo apretando como siempre y LOW propone el inicio y el máximo de presión de tu mano.

La **forma** del trazo no cambia: el estabilizador y la geometría quedan como estaban. Se probó cambiarlos, y la prueba de calidad del trazo (detalle, círculo, temblor) empeoraba en algún caso.

## Arreglado de paso: un trazo podía usar el filtro de otro

Los filtros y formas de cada trazo se numeraban desde 1 en cada dibujo. Cuando dos dibujos se veían juntos (el papel cebolla, otra capa o el export), un trazo terminaba con la textura, la forma o la dureza de otro. Ahora cada identificador es único, y las capas que se ven de contexto conservan sus texturas.

## Pruebas

- **`run_pinceles_tests.js`** (nueva, 20 casos) verifica:
  - el catálogo;
  - los remates;
  - que los pinceles de siempre dejen los mismos sellos;
  - que la variación sea siempre la misma para un mismo trazo;
  - los filtros de cada textura y del brillo;
  - la presión: el mouse vale 1, la calibración, el filtro por tiempo igual a 60 y a 240 muestras por segundo y la prueba de la tableta.
- **`check_pinceles_ui.js`** (nueva) usa el mouse y el lápiz de verdad. Verifica que:
  - con el mouse la presión es pareja, con el lápiz calibrado sigue la mano sin zigzag, y en ráfaga no se pierde ninguna muestra;
  - los 40 pinceles se dibujan con su textura, su brillo o su forma;
  - el grano se mide en los píxeles: grafito 28, tiza 61, tinta limpia 0;
  - en tres capas, y con el papel cebolla juntando dos cuadros, ningún id se repite;
  - la paleta recolorea un trazo texturado;
  - el Estudio filtra por categoría, muestra miniaturas y aplica la textura elegida.

  Contra la versión anterior falla en la presión del mouse, en el grano y en los ids repetidos.
