# LOW 3.10.1 — Esculpir trazos con la tableta: lo agarrado ya no vuelve y el círculo va en la punta

Reporte de Mauro, probando 3.10.0 con la tableta: «está desfasado el círculo de tamaño de la cruz y algunas modificaciones se vuelven a la posición anterior».

## Lo agarrado ya no vuelve a su lugar

**Por qué volvía.** Agarrar y Curvar escalaban el movimiento por la presión de **cada muestra** del lápiz. Al levantar el lápiz, las últimas muestras llegan con presión casi 0, así que justo al final el trazo volvía a su lugar.

Medido con un lápiz simulado: una recta agarrada desde el medio y llevada 100 unidades hacia abajo terminaba en y=402. Tendría que terminar cerca de 500.

**Ahora** Agarrar y Curvar siguen al lápiz entero, como en Blender: lo agarrado va adonde va la mano. La presión sigue manejando la fuerza en los modos de pasada (empujar, atraer, suavizar…), donde levantar el lápiz sólo hace menos y no deshace lo hecho.

## El círculo del pincel, en la punta

El círculo se ubicaba **dentro del lienzo**, restando su posición. Cualquier scroll o corrimiento del lienzo o de sus padres lo desfasaba respecto del puntero. Ahora va fijo en coordenadas de pantalla, exactamente en la punta del lápiz, y se esconde cuando el puntero sale del lienzo. Lo mismo vale para la guía de Redibujar.

## Pruebas

`check_esculpir_ui.js` suma dos casos, y con el código de 3.10.0 falla en el primero (y=402):

- **agarrar con un lápiz cuya presión cae al levantar:** el trazo queda donde lo dejó la mano, y Ctrl+Z lo deshace;
- **el círculo del pincel:** queda centrado en el puntero, a menos de 1 píxel, en dos lugares del lienzo, y vive fuera del lienzo.

Verificado también en la app real (WebView2): el círculo queda exacto en el puntero.
