# LOW v4.11.0 — XML para Premiere: la animación y su audio, en sincro

GIF, secuencia PNG y spritesheet son formatos para **mirar**. Cuando el trabajo
sigue en montaje hace falta otra cosa: que la animación entre a la línea de
tiempo del editor con su audio ya calzado. Eso, en el mundo real, es un XML de
FCP7 (`xmeml`) — lo que **Premiere, Resolve y Final Cut** importan sin plugins.

## Cómo se usa

**Exportar animación → XML para Premiere.** Escribe una carpeta
`export/<escena>_premiere/` con:

- la secuencia de cuadros en PNG,
- `audio.wav` con el audio de la escena,
- y el `.xml` que los referencia a los dos.

En Premiere: *Archivo → Importar* y se elige el XML. Cae una secuencia con el
fps de la escena, su resolución, un clip por cuadro y el audio en su lugar.

## Las dos decisiones que evitan el problema clásico

**Se escribe todo junto.** Cuadros, audio y XML en la misma carpeta, referenciados
por ruta relativa. Es lo que evita que la importación arranque con el cartel de
«archivo perdido» pidiendo relinkear cuadro por cuadro.

El audio sale como WAV desde el buffer decodificado porque el navegador nunca
nos da el archivo original —sólo su nombre—; escribirlo al lado del XML es lo
que hace que el montaje no tenga que buscar nada.

**El desfase se respeta sin correr el video.** LOW guarda el desfase del audio en
cuadros. Un audio **atrasado** entra más tarde en la secuencia; uno **adelantado**
recorta su cabeza en vez de correr la animación, porque el cuadro 1 de la
animación tiene que seguir siendo el cuadro 1 del montaje.

Y un detalle que el propio test descubrió antes de publicarse: el `timebase` de
una tasa NTSC es su entero **nominal** —29.97 va como 30, 23.976 como 24— con la
bandera `ntsc` puesta. La primera versión le sumaba uno y eso desfasa la
secuencia entera.

## Pruebas

- Suite nueva `tools/run_premiere_xml_tests.js` — **29/29**, en la puerta de CI:
  estructura xmeml, fps y resolución, un clip por cuadro, NTSC, las tres
  situaciones de desfase, escapado de comillas y ampersand, rutas como URL de
  archivo sin barras de Windows, y el WAV (cabecera RIFF, frecuencia, picos que
  no desbordan).
- Verificado en navegador el recorrido entero: exportar deja 3 cuadros, el WAV y
  un XML válido con la pista de audio en el cuadro 6, que es el desfase cargado.
- Cuatro contratos estáticos nuevos.
- El generador es un módulo **puro**: recibe datos y devuelve texto, así que se
  prueba sin navegador y sin escribir en disco.

## Pendiente

- De §12 SIGUIENTE queda **lipsync** (esto cubre la mitad de audio del punto 5) y
  la prueba de mocap con videos reales.
- **Trabajo remoto**: decidido el transporte —servidor propio en el droplet— y el
  alcance —presencia, bloqueos, edición simultánea, comentarios y pantalla
  compartida—. Es el próximo bloque grande.

## Reversión

Estable previa: `v4.10.0`. La exportación no toca el documento: sólo escribe
archivos nuevos en `export/`.
