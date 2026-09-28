# LOW v4.0.0 — Movimiento capturado dentro del flujo 2D

LOW 4 inicia una etapa nueva del módulo 2D: el video deja de ser una referencia
pasiva y se convierte en material editable para rotoscopía y rigging.

## Video y rotoscopía

- Importación local de actuaciones y sincronización con los cuadros.
- Selección del sujeto para aislar la región que se debe analizar.
- Extracción local, cancelable y configurable de siluetas con cámara fija.
- Corrección por cuadro de la máscara con mouse o tableta.
- Silueta superpuesta como guía y conversión a un nivel real de calco.
- Articulaciones humanas colocables y corregibles por cuadro.

## Retargeting humano verificable

- Transferencia de cadera, columna, cabeza, clavículas, brazos y piernas al rig.
- LOW sólo genera una cadena cuando sus dos articulaciones están confirmadas.
- La toma completa se aplica como una única acción reversible con `Ctrl+Z`.
- La transferencia no modifica geometría, pivotes ni jerarquía del esqueleto.

## Alcance honesto de esta versión

La detección automática de pose todavía no forma parte de LOW 4.0.0. Las
articulaciones se confirman manualmente para que el programa no invente datos ni
presente una simulación como captura real. La segmentación semántica, el
seguimiento corporal automático y la reducción inteligente de claves continúan
como trabajo posterior.
