# LOW v3.29.60 — El navegador de cámara del estudio 3D

Girar la vista se hacía arrastrando con el botón derecho sobre el dibujo, o
saltando entre botones de texto —Persp, Frente, Sup…—. Lo primero pelea con
dibujar: cada arrastre es la pregunta «¿esto era un trazo o era mover la vista?».
Lo segundo te dice adónde vas, pero nunca **desde dónde estás mirando**.

Ahora hay un navegador en la esquina inferior derecha: un círculo translúcido con
un cubo adentro que muestra siempre la orientación de la cámara.

## Qué hace

- **Arrastralo** y la vista gira alrededor del punto que estás mirando. El giro
  se frena justo antes del polo, que es donde la escena se da vuelta y uno
  pierde la orientación.
- **Tocá una cara** y la cámara salta a esa vista: frente, atrás, arriba, abajo,
  izquierda, derecha. La cara bajo el dedo se resalta antes de tocarla.
- **Tocá el aire** dentro del círculo y vuelve a perspectiva.

Vive en su propio canvas, no en la escena. Así no aparece en el picking del
dibujo, no se pisa con el joystick de transformación y no entra en el export: es
interfaz, no parte de la obra.

## Un detalle que lo habría dejado desincronizado

El widget se refrescaba sólo desde el bucle de dibujo, y ese bucle **se pausa
cuando la ventana pasa a segundo plano**. Al volver, el cubo habría quedado
mostrando desde dónde mirabas hace rato. Ahora el refresco está en un solo lugar
y se llama también en cada cambio de vista, así que el cubo nunca miente.

## Qué se midió

Sobre el build estático, que es el que corre dentro de LOW:

| caso | resultado |
| --- | --- |
| orientación del cubo en cada vista | los seis cuaterniones distintos y exactos (`front` identidad, `top` 0.707 en X, `right` −0.707 en Y…) |
| tocar el centro parado en cada vista | devuelve **esa misma vista** en las seis |
| tocar el aire | vuelve a perspectiva |
| arrastrar el cubo | la cámara pasa de `(0, 6)` a `(−5, 4)` en el plano XZ |
| el widget | 96 px, redondo, abajo a la derecha |
