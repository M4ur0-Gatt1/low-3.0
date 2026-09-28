# LOW v3.29.61 — Pincel de ancho fijo

El pincel sigue la presión del lápiz: apoyás más y el trazo engorda. Para
dibujar está bien, pero para entintar arruina el dibujo — un contorno que va
engordando y adelgazando según cómo apoyaste no sirve.

El **lápiz** ya daba línea pareja, pero es una línea: no tiene el cuerpo ni el
remate del pincel.

## Qué cambió

En la barra de estilo hay un interruptor **Ancho fijo**. Con él puesto, el
pincel sale del mismo grosor de punta a punta: no escucha la presión y tampoco
adelgaza en los extremos. Las puntas se rematan redondas — sin el afinado, un
corte recto dejaría los extremos cuadrados y se notaría cada empalme.

El interruptor se recuerda entre sesiones: es una forma de trabajar, no un modo
que haya que volver a poner cada vez.

## Qué se midió

El mismo recorrido dibujado con presión floja (0.15) y apretada (0.95),
midiendo el grosor real de la cinta:

| | trazo flojo | trazo apretado |
| --- | --- | --- |
| pincel normal | **7.6** | **38.2** |
| con ancho fijo | **20.5** | **20.5** |

Con ancho fijo, tres trazos con presión floja, apretada y creciente producen
**exactamente el mismo path**: el grosor deja de depender de la mano.
