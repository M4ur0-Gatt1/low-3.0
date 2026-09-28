# LOW v3.29.63 — Capas: carpetas de verdad y jerarquía completa

El panel de capas estaba desordenado por tres motivos concretos, y los tres
tienen la misma consecuencia: en cuanto el dibujo crece, no se encuentra nada.

## El triángulo para plegar estaba vacío

La carpeta se podía plegar —el código estaba— pero **el triángulo no tenía
texto**: era un espacio en blanco. No había nada que tocar, así que en la
práctica los subelementos no se podían esconder.

Ahora se ve: **▾** desplegada, **▸** plegada, y el tooltip dice cuántos elementos
tiene adentro.

## La jerarquía llegaba a un solo nivel

Un grupo mostraba sus hijos, pero si adentro había otro grupo, ahí se terminaba:
lo que estuviera más hondo **desaparecía de la lista** y no había forma de
llegar. Y un grupo anidado tampoco contaba como carpeta, así que no tenía
triángulo.

Ahora la lista baja hasta el fondo —con tope de ocho niveles— y la sangría crece
con la profundidad, así se lee de quién cuelga cada cosa. Arrastrar para
reordenar y emparentar funciona a cualquier nivel, no sólo en la raíz.

## Agrupar dejaba una carpeta sin nombre

El grupo nacía anónimo: en la lista aparecía una fila muda, imposible de buscar o
nombrar. Con dos grupos el panel ya era ilegible.

Ahora agrupar crea una carpeta **con nombre** —`grupo_1`, `grupo_2`…— que se
renombra con doble clic, y la barra lo dice: *«Carpeta "grupo_1" con 2 elementos
· el triángulo la pliega»*.

## Qué se midió

Sobre un dibujo con tres niveles de anidación:

| caso | antes | ahora |
| --- | --- | --- |
| profundidad visible | 1 nivel | **niveles 0, 1, 2 y 3** |
| sangría por nivel | — | `0 · 12 · 24 · 36 px` |
| triángulos | invisibles | **▾** en las tres carpetas |
| plegar una carpeta | no se podía | pasa a **▸** y sus hijos desaparecen; la carpeta queda |
| agrupar dos piezas | grupo anónimo | carpeta **`grupo_1`** con las dos adentro |
| agrupar de nuevo | — | **`grupo_2`**: la numeración sigue |
