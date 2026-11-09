# LOW 3.63.0 · Puentes: PSD y ORA por capas, Line Art desde el 3D, huesos y «mirar a»

Paso 5, el último del plan para tener en LOW lo que Blender trae para animación 2D con sus plugins.

## Archivo → «Importar capas (PSD, ORA)…»

Es el puente con **Photoshop** y **Krita** (o GIMP y MyPaint), lo que en Blender da COA Tools para el cut-out. Cada capa del archivo entra como una **capa de LOW**:

- **en su lugar y en su orden:** la de más atrás queda atrás;
- **con su visibilidad y su opacidad;**
- **todas juntas en un grupo** con el nombre del archivo.

Quedan listas para el esqueleto, para colorear encima o para usarlas de fondo. Si el lienzo del archivo no tiene el tamaño de la escena, se escala entero, sin deformar, y se centra. Un paso de Ctrl+Z.

El archivo lo lee el backend (`capas_archivo.py`), sin dependencias:

- **ORA:** el zip con su `stack.xml`. Respeta los grupos y su posición, y no lee nada fuera del zip.
- **PSD:** RGB de 8 bits, con canales crudos o comprimidos (RLE), transparencia y nombres unicode. Las carpetas de Photoshop se aplanan.
- **Lo que no entiende lo dice claro:** CMYK, 16 bits, PSB, compresión ZIP o un archivo cortado.

## Line Art cuadro a cuadro desde el 3D

En el estudio 3D, panel Toma → **«Sólo líneas (Line Art)»**:

- **Los volúmenes** (cajas, sólidos, rellenos y terreno) salen sólo con sus bordes y siluetas en negro, cuadro a cuadro, con las líneas ocultas tapadas por el propio volumen. Quedan listos para entintar encima.
- **Los trazos** quedan como son: ya son línea.
- **La opción viaja en el origen de la toma:** «Editar en el estudio 3D» y «Actualizar en el 2D» la respetan.
- **Los personajes articulados** todavía salen como siempre, porque sus bordes no seguirían la piel.

## Capas que siguen a un hueso y que «miran a» otra

En **Movimiento de la capa…**:

- **«Sigue a» lista también los huesos del rig.** Al pegarla se guarda la matriz del hueso en ese momento, así la capa no salta de lugar, y desde ahí lo sigue: el vaso en la mano del personaje.
- **«Mira a»:** la capa gira alrededor de su pivote apuntando a otra capa, como los ojos que siguen un objeto. Los círculos se rechazan, o si vienen en un archivo no cuelgan la app.

## Pruebas

- **`tools/check_capas_archivo_backend.py`** (nueva, en el build). Arma en memoria un ORA y un PSD reales, con una capa cruda, otra con RLE, una oculta y una carpeta, y comprueba:
  - orden, lugar, visibilidad y opacidad;
  - los mismos píxeles, decodificando el PNG de vuelta;
  - los grupos del ORA y la ruta con `../`;
  - seis errores claros.
- **`tools/check_importar_capas_ui.js`** (nueva, en el build): con el mouse desde Archivo.
  - Tres capas en orden, escaladas ×2, con visibilidad, opacidad y grupo.
  - El export sin la capa oculta.
  - Un Ctrl+Z las saca.
  - Un error del backend no agrega nada.
- **`tools/check_3d_lineart_ui.js`** (nueva, en el build): la misma toma da 2200 px de línea contra 76565 llenos, y la escena vuelve a sus materiales.
- **`tools/run_movimiento_capa_tests.js`**: 44 casos, con «mira a» y el hueso.

## Los 15 puntos

| # | Qué | Dónde quedó |
|---|---|---|
| 1 | Grupos de capas | 3.59 |
| 2 | Mover y emparentar capas (también a huesos) | 3.59, 3.63 |
| 3 | Desfase de tiempo sin destruir | 3.60 |
| 4 | Temblor de línea | 3.60 |
| 5 | Intercalar toda la secuencia | 3.58 |
| 6 | Mover varios cuadros con atenuación | 3.62 |
| 7 | Efectos de capa (desenfoque, sombra, resplandor, colorear) | 3.60 |
| 8 | Rellenos con degradé y textura | 3.61 |
| 9 | Se dibuja solo (build) | 3.60 |
| 10 | Tinte | 3.61 |
| 11 | Importar PSD y ORA | 3.63 |
| 12 | Line Art cuadro a cuadro | 3.63 |
| 13 | Cuadros de barrido (smear) | 3.62 |
| 14 | Restricciones: «mirar a» y seguir a un hueso | 3.63 |
| 15 | Hooks y claves por punto | Con editar nodos en dos claves más «Intercalar toda la secuencia» (ver 3.62) |
