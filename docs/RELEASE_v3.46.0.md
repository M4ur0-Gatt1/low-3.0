# LOW 3.46.0 · Las herramientas de AutoCAD se entienden

Sin funciones nuevas: arreglos de lo que ya estaba. Fase 2 del camino a la estabilidad.

## Herramientas tipo AutoCAD

Mauro avisó que no se entendían y que casi seguro no funcionaban. Las revisé en la app real, con mouse y teclado de verdad, y las cinco funcionaban: referencias a objetos (F3), desfase, matriz, igualar propiedades y la línea de comandos. El problema era que no se entendían:

- apretar Desfase, Matriz o Igualar sin nada elegido no hacía nada visible: el cajón se cerraba y el aviso salía en la barra de estado, abajo de todo;
- con F3 prendido, nada en la hoja lo decía;
- la matriz arrancaba con 20 mm entre copias, aunque el objeto fuera más grande, y las copias se pisaban;
- la barra de abajo («Pedile un cambio a LOW…») no decía que acepta comandos.

Lo que cambia:

- **Una tarjeta sobre la hoja** dice el comando, el paso que sigue y cómo salir (Esc). En el desfase, la distancia se cambia ahí mismo.
- **Sin nada elegido, el comando pide tocar el elemento**, como en AutoCAD (primero el comando, después el objeto):
  - Desfase: tocá la línea, después el lado. Sigue pidiendo líneas hasta Esc.
  - Igualar: tocá el que da las propiedades, después los que las toman.
  - Matriz: tocá lo que se repite y se abre el cuadro.
- **Con F3 prendido aparece una insignia** «⌖ Referencias a objetos» sobre la hoja. Tocándola se elige a qué puntos se enganchan los trazos; la ✕ las apaga.
- **La matriz arranca con la separación del tamaño de lo elegido**, un cuarto más que su ancho y su alto, y con las filas y columnas que entran en la hoja.
- **En el cajón de herramientas, el título «Como AutoCAD (F3 · O · AR · MA)»** marca cuáles son.
- **La barra de abajo** dice «o un comando: O · AR · MA · ?». Al escribir un comando, la barra de estado dice qué va a hacer Enter, y «?» muestra la lista sobre la hoja.

## Defectos corregidos (de la fase 2, encontrados en pruebas intermitentes)

- **El doble clic en una guía fallaba con la máquina ocupada.** Se medía con la hora de atender el evento, no con la del clic. Lo mismo pasaba al cerrar el polígono de selección con doble clic.
- **El panel separado parpadeaba sin estilos en cada cambio del estudio**, y al abrirse aparecía en negro antes de tomar sus colores.
- La letra de la insignia de las paralelas no tomaba su tamaño (regla `font` inválida).

## Pruebas

- `check_autocad_ui` suma el recorrido sin nada elegido:
  - el desfase y el igualar guiados;
  - la matriz guiada con la separación del tamaño del objeto;
  - la insignia de F3 y su ✕;
  - el título del cajón.
- `check_guias_regla_ui` y `check_panel_espejo_ui` reproducen siempre su defecto, no sólo bajo carga.
