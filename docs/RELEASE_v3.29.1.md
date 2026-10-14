# LOW 3.29.1 — Play sin cortes, dibujo que no se pone lento y MP4 sin instalar nada

Pedidos de Mauro:
- «instalame el ffmpeg o lo que haga falta para que LOW exporte MP4 … que sea lo más práctico posible, que nadie se tenga que instalar nada»;
- «en la visión de play en el programa se ve feo, como cortada la reproducción»;
- «hay alguna manera de agilizar el software? me da la sensación de que se pone lento … para dibujar vectores».

## Exportar MP4 sin instalar nada

LOW trae su propio ffmpeg adentro del programa. Exportar MP4 o WebM funciona en cualquier computadora, sin instalar nada aparte. Si la computadora ya tiene un ffmpeg instalado, LOW usa ese. El programa pesa unos 30 MB más.

## El play ya no se corta

Medido con una escena real a 24 fps: en 2 segundos se veían 32 de 48 cuadros. Ahora se ven los 48.

- **El reloj del play.** Después de mostrar un cuadro, esperaba un cuadro entero más antes de seguir. Por eso salteaba cuadros. Ahora espera justo hasta el momento del siguiente.
- **Paneles que se rearmaban en cada cuadro.**
  - La lista de elementos se armaba dos veces por cuadro. Ahora, mientras se reproduce, se arma una sola vez, al parar.
  - La tira de dibujos sólo mueve el resaltado del dibujo actual.
  - La línea de tiempo sólo toca las celdas que cambian.
- **Reproducción fluida.** Al dar play, LOW convierte cada cuadro en imagen una sola vez y reproduce esas imágenes. Si editás algo, las vuelve a hacer, así que nunca se ve una versión vieja. Al parar, vuelve la hoja normal para dibujar.

Con la computadora simulada al doble de lenta:
- recién apretado el play: 23 → 45 cuadros de 48;
- con los cuadros ya convertidos en imagen: 37 → 48 de 48.

## Dibujar ya no se pone lento

Medido en la app con 200 trazos seguidos: soltar el lápiz tardaba 13 ms con 25 trazos y 59 ms con 200, y seguía subiendo. La causa era el panel de Capas: después de cada trazo armaba una fila por cada trazo del dibujo, aunque en pantalla se ven nueve. Lo hacía incluso en el espacio de Animación, donde el panel está oculto.

Ahora el panel arma las primeras 60 filas y al final pone «… y N elementos más». Si la tocás, aparecen más. El elemento seleccionado siempre tiene su fila.

Terminar un trazo bajó de 13,5 a 4,5 ms. Soltar el lápiz queda en unos 25 ms, tengas 75 trazos o 200.

## Pruebas

- **`check_reproduccion_fluida_ui.js`** (nueva). Con el botón de play real y una escena pesada sobre una hoja con papel, comprueba:
  - que sin cuadros preparados se pintan al menos 42 de 48 en 2 s;
  - que con los cuadros listos se ve la imagen del cuadro que toca (su marca roja en su lugar) y se pintan al menos 44;
  - que al parar se va la imagen y queda la hoja real del cuadro donde paró;
  - que editar descarta las imágenes viejas;
  - que la tira de dibujos no se rearma al cambiar de cuadro.

  Falla si se deshace cualquiera de los tres arreglos: reloj viejo (32 de 48), lista por cuadro (32 de 48) o tira entera.
- **`check_capas_tope_ui.js`** (nueva). Con un dibujo de 300 trazos en el espacio Dibujo, comprueba:
  - que el panel arma 60 filas y la de «más»;
  - que un trazo real de pincel no agranda la lista;
  - que clickear en el lienzo el elemento del fondo de la lista le da su fila marcada;
  - que «más» arma otra tanda;
  - que tocar una fila selecciona su trazo.

  Falla sin el arreglo: 303 filas.
- **`LOW.exe --smoke`** comprueba que el programa trae su propio ffmpeg.
- Sigue pasando la puerta completa.
