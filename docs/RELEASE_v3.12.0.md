# LOW 3.12.0 — El balde de pintura rellena bien, y «Sostener dibujos» rellena la selección

## El balde de pintura

Reporte de Mauro: «revisá el bote de pintura, me parece que no anda».

Medido en la app real, trabajando a 200 %, había **cuatro** defectos:

1. **Las zonas chicas desaparecían.** El balde analizaba la hoja a 720 píxeles, casi 3 unidades por píxel. Adentro de un círculo chico (un ojo, un botón) no quedaba nada, y el clic caía en la zona grande de alrededor.
2. **Una zona ya pintada, partida por líneas nuevas, se recoloreaba entera.** Pasaba si primero se pintaba la cara y después se dibujaba el ojo: el balde en el ojo encontraba el relleno de la cara debajo del clic y lo recoloreaba completo.
3. **El borde del relleno era una escalera** de unas 3 unidades.
4. **Quedaba papel blanco entre el color y la línea:** el relleno se frenaba antes de la línea.

**Ahora:**

- **La hoja se analiza a un píxel por unidad** (1920 en una hoja HD). Medido, cuesta unos 40 ms más por análisis, también al pintar un nivel entero. «Hueco» sigue cerrando la misma distancia del dibujo que antes.
- **Si las líneas nuevas parten una zona pintada, el balde pinta la parte nueva:** la zona cerrada donde hacés clic recibe su propio relleno, encima, y el resto queda como estaba. Recolorear un relleno sin líneas nuevas sigue igual.
- **El color va por debajo de la línea**, como en Toonz y Harmony: la zona crece hacia los píxeles de la línea, nunca hacia otra zona. Así no queda papel blanco.
- **El borde se suaviza** (dos pasadas de Chaikin) y se simplifica para no pesar en el archivo.

## «Completar los huecos sosteniendo el dibujo anterior»

Reporte de Mauro: «al seleccionar todo y apretarlo debería rellenar todo lo seleccionado con el dibujo anterior».

Si la selección empezaba en un hueco y el dibujo estaba **antes** de la selección, no rellenaba nada: arrancaba desde la primera celda del rango, que estaba vacía. Ahora sostiene el último dibujo expuesto antes de la selección. Vale para el botón, el menú del clic derecho y la planilla.

## Pruebas

- **`check_balde_ui.js`** (nueva) usa el mouse de verdad. Comprueba que:
  - el balde rellena un círculo grande;
  - un círculo chico (radio 14) adentro del grande tiene su propio relleno, y el grande no cambia;
  - en un anillo de 180 puntos justo por dentro de la línea no queda papel blanco;
  - el borde no es una escalera;
  - una zona ya pintada, partida por un círculo nuevo, da un relleno propio para el círculo, y recolorear la zona sin líneas nuevas sigue andando.

  Con el código anterior falla de tres maneras:
  - papel blanco en 133 de 180 puntos;
  - 907 quiebres en el borde;
  - la zona entera recoloreada.

  Probada también en la app real, a 200 %.
- **`run_2d_model_tests.js`** suma un caso: el dibujo está antes de la selección y la selección empieza en un hueco. Con el código anterior falla.
- **`check_mover_cuadros_ui.js`** suma el mismo caso con el botón de verdad y la selección hecha con el mouse.
