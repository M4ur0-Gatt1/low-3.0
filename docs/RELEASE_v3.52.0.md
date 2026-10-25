
# LOW 3.52.0 · Seguir un recorrido, con perspectiva

Pedido de Mauro: «que la pelota vaya hacia atrás; tendría que achicarla cuadro por cuadro para dar la sensación de profundidad; si pudiera dibujar en perspectiva se podría hacer automático».

## El tamaño sale de la perspectiva de la escena

Es la cuenta del layout clásico: algo apoyado en el piso se ve tanto más chico cuanto más cerca del horizonte está, y su tamaño es proporcional a la distancia (en la hoja) entre el punto donde apoya y el horizonte.

- La ventana de **Seguir un recorrido** tiene una fila nueva, **Tamaño**:
  - **según la perspectiva de la escena**: usa el horizonte de las guías de Perspectiva (1 o 2 puntos de fuga). Lo que va hacia el fondo se achica y lo que viene hacia adelante crece. Si la escena tiene perspectiva, ésta viene elegida.
  - **a mano: al final __ %**: sin perspectiva, va de 100 % al tamaño que pongas, repartido por lo recorrido (el espaciado de las marcas manda, como en el resto del recorrido).
  - **igual**: como hasta ahora. Si la escena no tiene perspectiva, ésta viene elegida y la de perspectiva queda apagada.
- Antes de generar, la ventana anticipa el resultado: «de 100 % a 25 % en 8 cuadros».
- El objeto se escala **alrededor del punto del recorrido**, que es donde apoya. Lo que va al costado del trazo se acerca a él con la distancia, como en perspectiva.
- El recorrido marca dónde apoya el objeto. Para algo que vuela, dibujá el recorrido de su sombra en el piso.
- Si el recorrido cruza el horizonte, LOW lo avisa en vez de inventar un tamaño: algo apoyado en el piso no puede pasarlo.
- Funciona con «sumar», «reemplazar» e «insertar», con «que gire» y con varios objetos juntos. Todo entra en un solo Ctrl+Z.

## Pruebas

- `tools/check_recorrido_perspectiva_ui.js` (nueva, en el build), con el ratón de verdad. Con un punto de fuga, la pelota está en cada marca y del tamaño que da la perspectiva (±3 %), en un solo paso de Ctrl+Z. Sin perspectiva, esa opción se apaga y «a mano 50 %» la deja a la mitad, repartido por lo recorrido. Un recorrido que cruza el horizonte se avisa. Si la escala no se aplica, la prueba falla.
- `check_recorrido_ui` y `check_recorrido_flujo_ui` siguen en verde.
