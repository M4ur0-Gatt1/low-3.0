# ADR-005: importación profesional de pinceles y personajes vectoriales

**Estado:** Implementación inicial · **Fecha:** 2026-09-04 · **Decisor:** Mauro Gatti / Tropa Circa

## Contexto

LOW necesita reutilizar recursos creados en Photoshop, Procreate e Illustrator sin convertir el editor en una copia frágil de sus formatos propietarios. Un preset externo mezcla punta, dinámica, textura y comportamiento específico de cada motor; un archivo de Illustrator puede ser SVG, PDF-compatible o AI cerrado.

## Decisión

Todos los pinceles se normalizan al contrato `BrushPreset` de LOW. El archivo original sólo pertenece al adaptador de importación. El trazo final conserva `data-brush-id` y, cuando usa una punta raster, la imagen queda embebida dentro del SVG para que el documento sea portable.

- Entrada directa: PNG, JPEG y WebP como puntas.
- Paquetes: `.lowbrush`/JSON y `.brushset` (se extraen puntas raster).
- Photoshop `.abr`: se importan previews PNG/JPEG embebidos. Los ABR con muestras comprimidas no interpretables se rechazan con un mensaje explícito; nunca se simula una importación exitosa.
- Illustrator: SVG se importa directamente. Si el SVG trae un único grupo de capa con varios objetos, cada hijo se convierte en pieza independiente conservando los atributos del grupo.
- AI/PDF: se convierten a SVG mediante Inkscape cuando está disponible. Sin conversor se pide exportar SVG desde Illustrator, sin rasterización silenciosa.

## Entrada de tableta

Pointer Events sigue siendo la única ruta de entrada. Se consumen eventos coalescidos y `pointerrawupdate`, se conserva presión/tilt/twist por muestra y se soporta borrador. Preferencias permite calibrar presión mínima, máxima y gamma para drivers Huion/Wacom que no aprovechan todo el rango 0–1. El diagnóstico existente sigue disponible desde el mismo panel.

## Consecuencias

- Los recursos importados no dependen de que Photoshop, Procreate o Illustrator estén instalados al reabrir el documento.
- La compatibilidad con ABR es incremental: punta primero; dinámicas propietarias sólo se traducen cuando existe equivalencia verificable.
- Las puntas se reducen a 256×256 para controlar memoria y persistencia local.
- Una importación que excede la cuota local falla visiblemente.
- Cada textura raster se guarda una sola vez por trazo dentro de un `symbol` y
  las marcas la reutilizan con `use`, en vez de repetir el PNG embebido.
- Los trazos raster se limitan visualmente a 1600 dabs uniformemente
  distribuidos, conservando los extremos y el conteo de origen en
  `data-source-dab-count`; esto protege guardado, undo y colaboración.

## Próximos pasos

1. Decodificador de muestras comprimidas ABR v6/v10 con fixtures legales propios.
2. Persistencia de bibliotecas grandes en archivos del workspace/IndexedDB, no `localStorage`.
3. Editor visual de curva de presión y previsualización del preset.
4. Importar nombres y parámetros de Brush Studio desde `Brush.archive` cuando sean traducibles.
