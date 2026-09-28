# LOW v3.29.59 — Exportar la animación vuelve a funcionar

**Exportar animación no funcionaba con ninguna escena actual.** El diálogo ni
siquiera abría: no pasaba nada al elegirlo en el menú.

## Por qué

El export recorría `DZ.anim.frames`, la lista de archivos en disco del modelo
viejo. Las escenas de ahora viven en el modelo nuevo, donde esa lista está
vacía — así que el primer renglón de `dzExportModal` cortaba en seco y salía
sin decir nada.

No era un problema del tramo activo ni del rig: el export directamente no veía
la escena.

## Qué cambió

Cada cuadro se arma ahora desde la escena: se componen las capas visibles, se
envuelve todo con la resolución real del documento y se le aplican las poses del
rig y la cámara, igual que antes.

Tres cosas que había que cuidar:

- **La hoja de la paleta viaja adentro del SVG.** El PNG se rasteriza aparte del
  documento, y sin esos estilos los colores por paleta salían en negro.
- **Se exporta el tramo activo.** El mismo que arrastrás en la regla: si el
  tramo va de F4 a F9, salen esos seis cuadros y el diálogo lo dice.
- **Un cuadro vacío se saltea** en vez de cortar la exportación.

Y si algo sale mal, ahora lo dice: antes el menú se quedaba mudo.

## Qué se midió

Sobre el personaje de ejemplo, 13 cuadros a 24 fps:

| caso | antes | ahora |
| --- | --- | --- |
| abrir el diálogo | no abría, sin aviso | «13 cuadros (F1 a F13) a 24 fps» |
| el SVG de un cuadro | — | resolución `1020×1080`, con la paleta y todas las piezas |
| las poses del rig | — | matriz distinta en cada cuadro (F1 en reposo, F7 rotado) |
| rasterizar un cuadro | — | PNG real de `1020×1080`, 45 KB, con tinta |
| exportar con el tramo en F5–F8 | — | 4 PNGs, 178 KB, «F5 a F8» |
| spritesheet de 6 cuadros | — | grilla **3×2** de `1452×1024` |

El camino del modelo viejo queda intacto para las escenas que todavía lo usen.
