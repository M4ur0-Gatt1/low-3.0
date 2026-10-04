# LOW 3.2.2 — el trazo respeta los detalles

Medido con lápiz sintético (presión incluida), en lápiz y en pincel, con el suavizado por omisión:

| Caso | Antes | Ahora |
|---|---|---|
| Detalle chico (zigzag de 8 px) | quedaba al 58 % de su altura | 84 % (lápiz) · 87 % (pincel) |
| Círculo rápido | 97,7 % del radio | 99,7 % |
| Temblor del pulso en una línea lenta | 0,42 de desvío | 0,02 (lápiz) · 0,22 (pincel) |
| Línea rápida | terminaba 1,1 % corta | termina donde se levantó el lápiz |

## Qué cambió

- **El suavizado mide distancias, no cantidad de puntos.** La media del postproceso promediaba cada punto con sus dos vecinos de cada lado. En un trazo chico esos cinco puntos son todo el detalle, y por eso ojos, pestañas y rayados se aplastaban. Ahora el peso depende de la distancia a lo largo del trazo, en píxeles de pantalla: el temblor del pulso, que es denso y de 1 a 2 px, se promedia, y un detalle con puntos separados queda casi intacto.
- **La curva ya no retrocede.** Cuando dos tramos seguidos tenían largos muy distintos, la curva Catmull-Rom se pasaba hacia atrás: medido, una línea arrancaba 96 unidades antes de donde se apoyó el lápiz. Ahora ninguna manija pasa la mitad de su tramo. Con puntos parejos la curva es la misma de siempre.
- **El trazo termina donde se levantó el lápiz.** El estabilizador en vivo va un poco atrás del puntero, así que ahora se agrega el punto real del final.

La curva, el suavizado y el cierre del trazo se movieron al motor de dibujo (`ui/drawing/`), y `app.js` quedó 9 líneas más chico.

## Pruebas nuevas

- `tools/run_trazo_tests.js`: 7 pruebas del motor, sin navegador.
- `tools/check_trazo_calidad_ui.js`: el lápiz sintético en el estudio, con umbrales. Verificada por mutación: con la media por puntos de antes, cae al 58 %.
