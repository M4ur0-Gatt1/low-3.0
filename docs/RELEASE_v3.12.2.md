# LOW 3.12.2 — «,» y «.» cambian de cuadro, y el papel cebolla no titila en el play

## «,» y «.»

Reporte de Mauro: «el punto y la coma para cuadro anterior y cuadro siguiente no andan: muestran la leyenda pero no mueven el cuadro».

**Por qué pasaba.** Había dos defectos juntos.

1. **El atajo usaba el modelo viejo.** Movía la lista de cuadros de los `.svg` sueltos. En un `.low` esa lista está vacía, así que «.» calculaba el cuadro «−1» y no iba a ningún lado. Igual mostraba en la barra de estado «Cuadro siguiente · lo pidió la tecla».
2. **Otra parte de LOW usaba las mismas teclas para otra cosa.** Los atajos de animación tomaban «.» y «,» antes que nadie para **alargar y acortar la exposición** del cuadro actual, y cortaban la tecla ahí. Según el caso, la tecla cambiaba el timing en silencio en vez de moverse de cuadro.

**Ahora.**

- «.» va al cuadro siguiente y «,» al anterior, en cualquier espacio de trabajo. En el cuadro 1, «,» se queda en el 1.
- Las teclas siguen siendo reasignables en Preferencias → atajos.
- Alargar y acortar la exposición siguen en los botones ⊞ ⊟ de la línea de tiempo.

## El centelleo al reproducir la cámara

Reporte de Mauro: «la cámara, al hacer zoom, hace un centelleo» (con video).

**Qué se ve en el video.** Se reproduce un movimiento de cámara con el papel cebolla prendido. En cada cuadro, los fantasmas cambian de lugar y de color: rojo el pasado, verde el futuro. Los trazos gruesos, como la oreja o la línea del ojo, se notan más. La imagen titila y no se puede juzgar el movimiento.

Aparte, en el video hay cuadros que se ven «lavados». Ese efecto es del teléfono: la exposición agarra dos cuadros a la vez. LOW no lo hace.

**Ahora.** Mientras se reproduce **no se ve el papel cebolla**, como en Krita, TVPaint y OpenToonz (que lo deja como preferencia, apagada de fábrica). Al parar, vuelve solo.

Las capas que se ven en la mesa siguen visibles durante el play: comparten el mismo camino de dibujo y tienen que seguir avanzando.

## Arreglado de paso: las pruebas que fallaban «al azar»

El servidor de las pruebas en navegador (`python -m http.server`) tenía el mismo defecto que se arregló en la app en la 3.12.1: atendía como mucho 5 conexiones en espera. Con la máquina cargada cortaba pedidos, y algún programa no llegaba a cargar. En esta tanda, por ejemplo, salió «init: dzCornerDown is not defined» en una prueba que pasaba sola.

Medido: cortaba 41 de 120 conexiones simultáneas. Ahora las pruebas se sirven con **`tools/servidor_mock.py`** (cola de 256), en CI y en la puerta local. `check_servidor_rafaga_backend.py` lo vigila: con la cola de 5 falla, con 79 de 120 cortadas.

## Pruebas

- **`check_coma_punto_cuadro_ui.js`** (nueva) aprieta las teclas de verdad en los espacios de Dibujo y de Animación. Con el código anterior falla: «.» no avanzaba del cuadro 1.
- **`check_cebolla_al_reproducir_ui.js`** (nueva) dibuja tres círculos con el ratón en tres cuadros y prende el papel cebolla. Comprueba que:
  - parado hay fantasmas;
  - durante el play no hay ninguno, en 25 muestras;
  - las capas de la mesa siguen visibles;
  - al parar, la cebolla vuelve.

  Con el código anterior falla: había 2 fantasmas a la vista durante el play.
- Probado en la app real, grabando la pantalla durante el play, con seis dibujos, claves de cámara a 255 % y la cebolla prendida.
