# LOW 3.0.0 — repositorio nuevo, el mismo LOW

LOW sigue en **`M4ur0-Gatt1/low-3.0`**. El repositorio anterior,
[`low-2.0`](https://github.com/M4ur0-Gatt1/low-2.0), queda **archivado**: se
puede leer y descargar todo, pero no recibe cambios.

## Qué es y qué no es

- **Es el mismo programa** que la v4.52.0 de low-2.0, archivo por archivo, más
  los tres arreglos de abajo. No hay reescritura.
- **La numeración vuelve a empezar en 3.0.0.** La 4.52.0 era anterior a esta,
  aunque el número sea más alto.
- **Historial nuevo, con un solo autor.** En low-2.0 había commits atribuidos a
  cuentas de otras personas: algunos por una línea `Co-Authored-By` que GitHub
  asigna a una cuenta ajena, y otros por un correo de git que no era el de la
  cuenta. Acá todo está a nombre de
  [Mauro Gatti](https://maurogatti.art) y no hay otros colaboradores.
- **Se dejaron afuera** los scripts sueltos de prueba de la raíz (`test_*.py`),
  salidas de consola viejas (`build_log.txt`, `find_results.txt`,
  `test_output.txt`), archivos compilados de Python y un script de
  compilación y publicación automática que ya nadie usaba y hacía commit por su
  cuenta. Ninguno formaba parte del programa ni de la puerta de pruebas.

## Arreglos respecto de la 4.52.0

1. **La 4.52.0 no llegó a tener instaladores.** Su compilación se cortó en la
   puerta de pruebas por `check_color_studio_ui`. La prueba esperaba a la
   interfaz pero no al puente de la app, y en el servidor de GitHub (más lento)
   llegaba antes de tiempo. No era un defecto del programa. Ahora espera las dos
   cosas, como el resto de los recorridos.
2. **El instalador decía 4.51.0** en la 4.52.0. Ahora las tres fuentes de
   versión (`VERSION`, `main.py` y el instalador) dicen lo mismo.
3. La firma del ejecutable apunta a la dirección del repositorio nuevo.

## Instalar sobre una versión 4.x

Usá **el instalador** (`LOWSetup-3.0.0.exe`): reemplaza la instalación
anterior y anota la versión nueva. Si en cambio abrís un `LOW.exe` 3.0.0 suelto
con la 4.52 todavía instalada, LOW va a avisar que «hay una versión más nueva
instalada», porque compara números. Tus archivos `.low` abren igual en las dos.

## Lo que trae (de la 4.51 y la 4.52)

- Capas como en Harmony y Photoshop:
  - todas las capas se ven mientras se dibuja;
  - la de adelante va arriba en la línea de tiempo;
  - mesa de luz por capa, modos de fusión y opacidad, que salen igual en la
    exportación;
  - reordenar, duplicar y eliminar capas con Deshacer.
- Cambiar o crear una capa ya no pisa el dibujo de otra.
- «+ Capa» a la vista, y Deshacer ya no queda en bucle en una capa nueva.
- Importar proyectos de Storyboarder.
- Del storyboard al animatic.
- Audio con desfase a tiempo.
- La primera pose de cut-out ya no se pierde.
- Proveedor de IA StepFun.

## Puerta

Corrida entera sobre este árbol antes de publicar: suites de modelo, puentes,
contratos y todos los recorridos reales.
