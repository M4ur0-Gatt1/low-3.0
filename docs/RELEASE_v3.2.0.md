# LOW 3.2.0 — el estudio con el estilo de Moho, en la paleta de LOW

## Una portada de programa de animación

La primera pantalla ya no promociona el experimento «Interpretar». Es una tarjeta con dos columnas:

- **Empezar**: «Nuevo documento» (1920 × 1080, 24 cuadros por segundo) y «Abrir documento…».
- **Recientes**: los `.low` del proyecto, del más nuevo al más viejo, con su carpeta y cuándo se tocaron. Un clic los abre por el camino de siempre, que avisa si quedaron cambios sin guardar.

El rescate ante un cierre forzado sigue apareciendo ahí cuando hay algo que recuperar.

Al cerrar el último documento, la portada queda limpia como al arrancar. Antes la línea de tiempo seguía abierta y vacía, con datos del documento que ya no estaba.

**«Interpretar» pasó al menú**, como herramienta: *Animación → Interpretar el ritmo…*. Se sacó el botón que tenía en la barra superior.

## El estilo y la lógica de Moho, con la paleta de LOW

La paleta no cambia: son los tres colores de LOW, los del rayo de Bowie. **Negro** de base, **naranja** y **celeste**. De Moho 14 se tomaron la forma y la lógica:

- **Herramientas como baldosas** con borde fino, en grilla. La activa queda encendida en naranja, no apenas teñida.
- **Cada panel con su barra de título.**
- **La regla de cuadros es una banda propia**, y las exposiciones se ven como bloques, igual que las barras de claves de Moho.
- **La hoja sobre una mesa lisa**, sin damero y con sombra.
- **Campos numéricos enmarcados** (FPS, IN, OUT y las opciones de herramienta) que se leen de un vistazo.
- **La lógica de color de Moho**, que reserva un color para «el tiempo» y otro para «lo que estás tocando». En LOW el tiempo es **celeste**: la regla, las exposiciones y la capa elegida. Lo que tocás es **naranja**: la herramienta activa, el cuadro actual y el botón principal.

Todo vive en una sola hoja, `design/estudio-moho.css`, que se carga al final. Solo pinta: no cambia tamaños de lo que miden las pruebas. El tema claro sigue como estaba.

## Arreglado

- **La X-sheet decía «(vacío)»** al abrir un documento desde la portada, aunque tuviera capas. Era la misma carrera que tenía la línea de tiempo: el dibujante viejo esperaba al puente y, al volver, pisaba la vista del documento.

## Pruebas

- **Nueva:** `check_recientes_backend.py`.
- **Ampliadas:**
  - `check_cerrar_documento_ui`: la portada queda limpia al cerrar.
  - `check_timeline_una_vista_ui`: también vigila la X-sheet.
- **Actualizada:** `check_rhythm_ui` abre «Interpretar» desde el menú, como lo abriría cualquiera.

La lectura de recientes vive en `recientes.py`. Un contrato prohíbe leer fechas de archivos en `main.py`, para que no vuelva una heurística equivocada sobre la fecha del ejecutable. Acá la fecha sirve para otra cosa —ordenar documentos— y se explica en el módulo.
