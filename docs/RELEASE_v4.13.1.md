# LOW v4.13.1 — Que se entienda y que se encuentre

Dos cosas señaladas al usarlo. Las dos son de las que no se notan escribiendo
código y se notan enseguida animando.

## «1s 2s 3s» ahora dicen «1F 2F 3F»

Los botones de exposición venían rotulados a la inglesa —*on ones, on twos*—
y en castellano esa «s» se lee como **segundos**, que es justo lo contrario de
lo que hacen: son **fotogramas**. Cambiados en la Timeline y en la X-sheet, con
los textos de ayuda al tono: «Cada dibujo dura 2 fotogramas».

## El XML para Premiere se puede encontrar

Estaba, funcionaba, y no había forma de dar con él: vivía como quinto botón
dentro de *Exportar animación*, el menú Archivo prometía «GIF/PNG» y el botón
de la Timeline nombraba GIF, PNG y spritesheet. Nada en el camino decía audio,
sincro ni Premiere. Culpa de no haber actualizado las etiquetas al agregarlo.

Ahora:

- **Animación → Sincronizar con el audio y exportar XML…**, pegado a *Cargar
  audio*, que es donde uno lo busca cuando piensa «quiero esto en Premiere».
- El menú Archivo dice **MP4 · PNG · XML**, y el botón de la Timeline nombra el
  XML con el audio en sincro.
- Si la escena **no tiene audio**, avisa antes y no después: se puede exportar
  igual —queda una secuencia lista para montar— pero uno se entera de que va a
  salir mudo mientras todavía puede cargar el audio.
- El modal de exportar dice qué audio hay cargado, o que no hay ninguno.

## Cómo se usa, entonces

1. **Animación → Cargar audio…** (wav o mp3). Queda en la escena y se ve en la
   Timeline.
2. Animar contra ese audio. Si hay que sincronizar una boca, el panel de
   rigging tiene **Lipsync**, que reparte las bocas según el volumen.
3. **Animación → Sincronizar con el audio y exportar XML…**
4. En Premiere: *Archivo → Importar*, elegir el `.xml`. Cae una secuencia con
   el fps y la resolución de la escena, un clip por cuadro y el audio en su
   lugar. La carpeta `export/<escena>_premiere/` lleva los PNG, el `audio.wav`
   y el XML juntos, referenciados por ruta relativa: por eso la importación no
   arranca pidiendo relinkear.

## Pruebas

- 4 contratos estáticos nuevos: que los botones no vuelvan a decir segundos y
  que el XML no vuelva a quedar escondido dentro del modal.
- `check_workspace_ui.js` verifica los rótulos **renderizados** en las dos
  vistas y falla si reaparece cualquier «Ns».
- Batería completa: 10 suites de modelo, 4 comprobaciones Python y 14
  recorridos E2E, en verde.

## Reversión

Estable previa: `v4.13.0`. Sólo cambian rótulos y caminos de menú; el
exportador es el mismo.
