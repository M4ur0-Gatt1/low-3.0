# LOW 3.56.0 · El 3D y el 2D, vinculados

Pedido de Mauro: «vinculemos mejor el estudio 3D para fondos, layouts y laboratorio de personajes, y su vínculo con el estudio 2D».

Hasta ahora el 3D le mandaba imágenes al 2D, una sola vez. El `.low` no sabía de qué proyecto 3D había salido un fondo. Si había que correr un edificio, había que rearmar la escena en el 3D y volver a mandar todo a mano.

## Editar en el 3D una capa que vino del 3D

- **Cada envío guarda su origen.** «Mandar este encuadre», «Mandar en planos» y «Mandar la toma» guardan, junto con las imágenes, el proyecto 3D de donde salieron y los ajustes del envío: con o sin cajas, cuántos planos, en unos o en dos, JPG o PNG y su calidad.
  - El proyecto se guarda una sola vez en la escena, aunque lo usen varios planos.
  - Al guardar quedan sólo los proyectos que alguna capa usa.
- **Clic derecho en el nombre de la capa → «Editar en el estudio 3D…».** Se abre el estudio con ese proyecto y arriba aparece la barra «Editando… del 2D».
- **Tu escena del 3D no se pierde.**
  - La que tenías abierta se aparta mientras editás, y el autoguardado sigue guardando ésa, no la del 2D.
  - Vuelve sola al terminar, aunque sin su historial de Ctrl+Z.
- **«Actualizar en el 2D»** manda lo mismo de nuevo, con los mismos ajustes y el mismo nombre:
  - reemplaza a la capa de antes, sin apilar otra;
  - es un solo paso de Ctrl+Z;
  - el estudio vuelve solo al 2D.
- **«Cancelar»** devuelve tu escena sin mandar nada.
- **Por ahora, sólo encuadre, planos y toma.** La hoja de modelo, el giro y la actuación del Taller todavía no guardan origen.

## Arreglos

- **Mandar un encuadre se deshace con un solo Ctrl+Z.** Antes eran dos pasos: el primero dejaba el calco nuevo con los puntos de fuga viejos.
- **El encuadre único ya no va en base64 adentro del `.low`.** Va como archivo a la carpeta `<nombre>.fondos/`, igual que las tomas y los planos.
- **El estudio 3D muestra si los planos llegaron al 2D.** El 2D siempre contestaba, pero nadie escuchaba, así que un error no se veía.
- **El atajo «3» abre el estudio 3D.** Antes llamaba al «Espacio 3D» retirado y tiraba un error.
- `LOW.animation.layout3d` exporta también `recibirHoja`, como los otros receptores.

## Pruebas

- **`tools/run_fuente3d_tests.js`** (nueva, en el build): 41 pruebas.
  - El normalizador del origen.
  - La ida y vuelta por archivo: el origen y el proyecto sobreviven a guardar y reabrir.
  - Deshacer y Rehacer devuelven el origen.
  - Actualizar no apila capas.
  - Un envío sin origen conserva el anterior.
  - El encuadre es un solo Ctrl+Z.
  - El 2D espera a que el estudio esté listo antes de mandarle la capa a editar.
  - Se rompieron a propósito seis partes del código y las pruebas detectan las seis.
- **`tools/check_3d_editar_desde_2d_ui.js`** (nueva, en el build): el recorrido completo en el navegador.
  - Se mandan los planos, se trabaja en otra escena y se usa el clic derecho real sobre la capa.
  - Se gira la vista y se actualiza: un solo Ctrl+Z, y el origen pasa al proyecto nuevo.
  - El autoguardado guarda tu escena mientras editás, tu escena vuelve al terminar y «Cancelar» no manda nada.
- **`tools/check_fondos_archivo_backend.py`**: suma el encuadre y los planos. Sin el arreglo, falla.
- **`tools/check_perspectiva_3d_ui.js`**: ahora exige un solo Ctrl+Z por envío.
