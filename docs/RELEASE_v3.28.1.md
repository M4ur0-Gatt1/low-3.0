# LOW 3.28.1 — Se acabó el «ding» de Windows al elegir herramientas; pendientes de la 3.28

## El sonido de error al apretar una tecla

Reportado por Mauro: «al apretar por ejemplo la B para elegir el pincel primero me da un error de Windows sonoro muy molesto, y después tengo que hacer un clic sobre el dibujo y ahí volver a apretar la B».

**La causa, medida en la app real.** Después de apretar y soltar **Alt solo**, la ventana de LOW quedaba en «modo menú» de Windows. Lo medí con `GetGUIThreadInfo`: el hilo quedaba con `GUI_INMENUMODE` y `GUI_SYSTEMMENUMODE`. En ese modo:
- la letra siguiente no le llega a LOW;
- Windows suena porque no hay menú que la reciba;
- un clic sobre el dibujo lo cancela.

LOW usa Alt todo el tiempo (Alt+arrastrar duplica, Alt en el marco, Alt+C, Alt+1…7), así que pasaba a cada rato.

**El arreglo.** La ventana ignora el comando de Windows que arranca ese modo (`WM_SYSCOMMAND` / `SC_KEYMENU`), con dos cuidados:
- LOW sigue recibiendo Alt para todos sus atajos;
- Alt+Espacio sigue abriendo el menú de la ventana.

Vale para la ventana principal y para los paneles en «Otra pantalla». Medido otra vez en la app real: después de Alt solo ya no hay modo menú, y la B siguiente elige la herramienta.

También descarté dos sospechosos: después de cerrar un diálogo de Windows y al volver de otra ventana, el foco vuelve bien a LOW.

## Pendientes de la 3.28

- **«Toda la capa» y «Cuadros elegidos» ahora también se aplican a:**
  - **las flechas del teclado**: Shift+→ mueve igual en todos los dibujos;
  - **los botones del inspector**: voltear, alinear.

  Los campos numéricos que se tipean siguen siendo de este dibujo: cada tecla sería un paso de deshacer.
- **Aviso de nivel compartido:** si otra capa usa el mismo nivel, el aviso dice que también cambia, porque sus dibujos son los mismos.
- **Lipsync desde el texto:** un diálogo nuevo encima de otro dejaba al viejo con su tramo entero, y **quitar o rehacer el viejo borraba las bocas del nuevo**. Ahora el viejo se recorta:
  - si queda cubierto entero, se va;
  - si sobresale, se achica;
  - si el nuevo cae en el medio, queda en dos partes, y la segunda aparece como «(parte 2)».

## Pruebas

- **`check_sin_modo_menu.py`** (nueva) crea una ventana de Windows de verdad y le aplica el arreglo como a la de LOW. Comprueba que Alt solo y Alt+letra no arranquen el modo menú, que Alt+Espacio sí, y que el resto de los mensajes pasen. Falla sin el arreglo. Corre en el paso de Windows de CI.
- **`run_lipsync_dialogos_tests.js`** (nueva, 13 casos): diálogos que se pisan en el medio, al final, al comienzo y enteros; que quitar y rehacer el viejo no toquen al nuevo; y el Ctrl+Z. Sin el arreglo, quitar el viejo borraba todas las bocas del nuevo.
- **`check_seleccion_alcance_ui.js`** (ampliada): Shift+→ dos veces mueve 20 en los tres cuadros, y voltear voltea en los otros.
