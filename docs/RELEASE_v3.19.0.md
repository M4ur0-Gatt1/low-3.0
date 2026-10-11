# LOW 3.19.0 — 1076 pinceles nuevos incluidos, y clic derecho en las capas

## Siete bibliotecas nuevas, incluidas

Mauro eligió cuáles sumar, entre las que tienen una licencia que permite incluirlas en LOW. Vienen instaladas y aparecen en el Estudio de pinceles, en el selector de bibliotecas:

| Biblioteca | Pinceles | Qué trae | Licencia |
|---|---|---|---|
| **MyPaint · pinceles oficiales** | 196 | Lápiz, entintado, acuarela, carbonilla, tiza y difuminado. De Martin Renold y el equipo de MyPaint, Ramón Miranda, Marcelo «Tanda» Cerviño, David Revoy, Guillaume Loussarévian y Brien Dieterle. | CC0 |
| **K. M. Alexander · Ogilby** | 600 | Sellos de atlas del siglo XVII: aldeas, castillos, iglesias, ríos, bosques, molinos y barcos. | CC0 |
| **K. M. Alexander · Hyacinth** | 196 | Montañas, cordilleras y estribaciones. | CC0 |
| **David Revoy · Krita 23.01** | 38 | Detalle, veladura y textura. | CC0 |
| **David Revoy · Krita 2021** | 18 | Boceto, pintura y tinta. | CC-BY 4.0 |
| **David Revoy · Krita 4 Extras** | 25 | Lápiz de boceto, de entintado, portaminas, gouache, tiza y pincel seco. | CC-BY 4.0 |
| **David Revoy · Charcoal pencils** | 3 | Carbonilla, lápiz de color y lápiz. | CC-BY 4.0 |

Con las de antes, LOW trae **1.548 pinceles**. El instalador crece unos 7,6 MB.

- Las licencias se verificaron en el texto de cada paquete o en la página del autor. Con autor, fuente, licencia y SHA-256 del original están en `pinceles/CREDITOS.md`; esa página es también la atribución que piden las CC-BY.
- De MyPaint se incluyen **sólo los pinceles** (CC0); los scripts del repositorio son GPL y no se incluyen.
- Los pinceles de MyPaint son paramétricos: usan la punta redonda de LOW, igual que en MyPaint.
- `tools/armar_biblioteca_incluida.py` convierte un paquete descargado en una biblioteca incluida. Lee lo descargado como datos, con el importador de LOW.

### El Estudio abre rápido con 1.500 pinceles

Medido en la app: con todas las bibliotecas, abrir el Estudio congelaba la pantalla **1,9 s**, porque dibujaba de una vez la miniatura de cada pincel. Ahora **abre en 0,24 s**:

- se dibujan sólo las miniaturas que se ven en la lista (y un margen), y las demás aparecen al bajar;
- cada miniatura se guarda, y filtrar o buscar no las rehace.

Las bibliotecas terminan de cargar 1,8 s después de abrir LOW, sin frenar nada.

## Clic derecho en una capa

Pedido de Mauro: «me falta el flujo para eliminar capas enteras de la línea de tiempo; quizá clic derecho y opciones de renombrar, mover, enviar al fondo, traer adelante o eliminar la capa».

Eliminar existía, pero escondido adentro del botón de propiedades de la capa (el de los deslizadores). Ahora, como en Toon Boom, Photoshop o After Effects, el **clic derecho sobre el nombre de una capa** —en la línea de tiempo o en la cabecera de su columna de la X-sheet— abre su menú:

- **Renombrar…** (también con doble clic)
- **Duplicar capa**
- **Traer al frente** · **Subir una posición** · **Bajar una posición** · **Enviar al fondo**
- **Eliminar capa…**: pide confirmación, se deshace con Ctrl+Z (vuelve con sus dibujos), y está apagado si es la única capa.

Lo que no se puede hacer queda apagado: no se puede subir la capa de más arriba, ni bajar la de más abajo.

## Pruebas

- **`check_capa_menu_ui.js`** (nueva) usa el ratón de verdad, con tres capas. Recorre:
  - renombrar;
  - al frente y al fondo;
  - subir y bajar, con lo imposible apagado;
  - duplicar;
  - eliminar: pide confirmación, no borra antes de aceptar, y Ctrl+Z la devuelve con su dibujo;
  - el mismo menú desde la X-sheet;
  - con una sola capa, Eliminar apagado.

  Falla sin el módulo nuevo. Encontró, además, que elegir la capa al abrir el menú lo cerraba en el acto: la línea de tiempo se redibujaba y el menú se cierra con cualquier scroll.
- **`check_brush_import_backend.py`**:
  - acepta CC0 o CC-BY, con la atribución en CREDITOS.md;
  - exige puntas propias sólo a los paquetes de sellos (Photoshop, GIMP), no a los paramétricos (MyPaint, presets de Krita).
