# LOW v4.2.0 — Pinceles profesionales, importación vectorial y storyboard

Esta versión eleva el flujo de dibujo y preproducción: incorpora un Estudio de
pinceles dedicado, importación vectorial por piezas, una primera compatibilidad
honesta con pinceles externos y un storyboard con generación de tomas. También
corrige el layout de la mesa multiplano para que el escenario 3D sea realmente
utilizable y no se superponga con los paneles 2D.

## Estudio de pinceles

- Inspector lateral sin overlays, con búsqueda, favoritos y filtros de pinceles
  incorporados e importados.
- Previsualización real del motor y edición no destructiva de presets de fábrica.
- Controles de tamaño, opacidad, espaciado, suavizado, presión, inclinación,
  dispersión y dureza.
- Catálogo ampliado con pinceles de animación, tinta, rough, gouache, acuarela,
  carbonilla, pastel, spray, píxel y caligrafía.
- Puntas raster almacenadas una sola vez por trazo mediante `symbol/use`.
  Los trazos extremos tienen un límite uniforme de 1600 dabs para proteger
  guardado, Undo y sincronización colaborativa.

## Importación y tabletas

- PNG, JPEG y WebP como puntas de pincel; paquetes `.lowbrush` y `.brushset`.
- Importación inicial de ABR cuando contiene previews PNG/JPEG interpretables.
- SVG de Illustrator conservado como vector y separado por objetos cuando la
  capa superior contiene múltiples piezas.
- AI/PDF puede convertirse mediante Inkscape cuando está instalado; sin un
  conversor se solicita SVG y nunca se rasteriza silenciosamente.
- Eventos coalescidos, `pointerrawupdate`, presión, tilt y twist, más calibración
  de rango y gamma para drivers Huion/Wacom.

## Storyboard y Timeline

- Storyboard persistente dentro de la escena, con Undo/Redo, duración por panel,
  acción y diálogo.
- Generador de tomas por tipo de plano, ángulo, lente y duración.
- Escenario 3D de referencia para medir encuadre, distancia, altura y cobertura.
- Pista de sustituciones visible en Timeline: diferencia cambios de dibujos
  sostenidos y permite borrar una sustitución con Alt+clic.

## Composición

- Mesa multiplano en un viewport dedicado de tres zonas: outliner, escenario e
  inspector. Los paneles generales dejan de ocupar o tapar el escenario.
- Abrir el Estudio de pinceles desde Composición vuelve explícitamente al
  workspace Dibujo.

## Verificación

```text
Modelo 2D                              323/323
Mesa multiplano                         14/14
Colaboración y dibujo                      8/8
Importación SVG/brushset/ABR                OK
E2E workspace, multiplano y Brush Studio   OK
Trazo raster extremo     12.265 → 1.600 dabs
```

## Experimental y pendiente

- ABR comprimido moderno: sólo se aceptan recursos que puedan interpretarse de
  forma verificable. No se anuncia compatibilidad total todavía.
- El escenario de storyboard usa figuras de referencia; el siguiente paso es
  enlazar personajes riggeados reales y poses articulación por articulación.
- La matriz física de tabletas Huion debe ampliarse con más modelos y versiones
  de driver; la ruta Pointer Events y su calibración ya están implementadas.
- Las bibliotecas de pinceles muy grandes deberán migrar de almacenamiento local
  a IndexedDB o archivos de proyecto.

## Reversión

La versión estable anterior es `v4.1.0`. Los proyectos mantienen sus estructuras
anteriores; los campos nuevos de storyboard, composición y pinceles se ignoran
de forma segura al volver a esa versión, aunque esas funciones no estarán
disponibles allí.
