# LOW v3.29.88

## Rigging más confiable

- `Repartir` convierte las muestras de cada pieza desde su sistema local al
  sistema del lienzo antes de compararlas con los huesos.
- Las piezas dentro de grupos trasladados, escalados o girados dejan de
  vincularse usando posiciones falsas.
- El recorrido Chromium comprueba la conversión espacial sobre una pieza
  rotada y escalada.
- La aceptación también guarda y reabre el personaje completo, verifica sus
  dieciocho vínculos y una pose, y comprueba que la exportación incluya la pose
  sin guardar atributos temporales del preview.

Este cambio completa una parte crítica del recorrido personaje → esqueleto →
vínculos → pose → guardar → reabrir → exportar. La deformación flexible y los
pesos continúan siendo trabajo posterior, no se presentan como terminados.
