# LOW 3.2.4 — Reexponer muestra los dibujos del nivel

## El botón «Reexponer» ahora se entiende

Antes, «Reexponer» solo pegaba celdas copiadas antes con Ctrl+C. Si no habías copiado nada, mostraba un aviso chico en la barra de estado y no pasaba nada más, así que parecía roto.

Ahora el botón abre la lista de dibujos del nivel:

- Cada dibujo aparece con su **miniatura** y dónde está expuesto, por ejemplo «Dibujo 2 · en F3».
- **Elegís uno y queda expuesto** en la celda actual o en todos los cuadros que tengas seleccionados.
- No crea dibujos nuevos: las celdas comparten el dibujo del nivel, así que si lo corregís, se corrige en todos lados.
- Si tenés celdas copiadas, la primera opción de la lista es **pegarlas** en esa posición.
- Es un solo paso de historial: Ctrl+Z lo deshace entero.

La misma lista se abre desde el clic derecho sobre la línea de tiempo, en «Reexponer un dibujo del nivel…».

## Pruebas

- `check_timeline_seleccion_ui.js`, con clics reales:
  - el botón muestra los dibujos del nivel con su miniatura y dónde están expuestos;
  - elegir uno lo expone en la selección sin crear dibujos, en un solo paso;
  - Ctrl+Z vuelve exacto;
  - el clic derecho abre el mismo selector.
- `run_undo_estado_tests.js` (54 casos) incluye «reexponer un dibujo del nivel en una selección».
- Corrida contra la versión anterior, la prueba falla igual que lo que se veía: el botón no abría nada.
